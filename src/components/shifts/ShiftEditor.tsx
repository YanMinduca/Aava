import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDebounced } from "@/lib/use-debounced";
import { fmtShiftLong, parseISODate, servicesForDate, shiftError, todayBR, type Shift, type ShiftWarning } from "@/lib/shifts";

const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "long" });
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

/**
 * Janela do líder para montar a escala de um culto: escolhe o culto, marca os voluntários e vê, ao vivo,
 * os avisos (culto seguido, mesmo culto em dois departamentos, mais de 3 escalas no mês).
 * Os avisos NÃO impedem de salvar.
 */
export function ShiftEditor({
  dept,
  initialDate,
  shift,
  schedule,
  onClose,
}: {
  dept: { id: string; name: string };
  initialDate: string;
  shift: Shift | null;
  schedule: { day: string; time: string; name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState(shift?.date ?? initialDate);
  const options = useMemo(() => servicesForDate(parseISODate(date), schedule), [date, schedule]);

  const [choice, setChoice] = useState<string>(() => {
    if (!shift) return "0";
    const i = servicesForDate(parseISODate(shift.date), schedule).findIndex((o) => o.name === shift.name && (o.time ?? "") === hhmm(shift.time));
    return i >= 0 ? String(i) : "custom";
  });
  const [customName, setCustomName] = useState(shift && choice === "custom" ? shift.name : "");
  const [customTime, setCustomTime] = useState(shift && choice === "custom" ? hhmm(shift.time) : "");
  const [selected, setSelected] = useState<Set<string>>(new Set(shift?.members.map((m) => m.memberId) ?? []));
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const [search, setSearch] = useState("");

  const opt = choice === "custom" ? undefined : options[Number(choice)];
  const service = opt ?? { name: customName.trim(), time: customTime || null };
  const monthLabel = MONTH.format(parseISODate(date));
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const inPast = valid && date < todayBR();

  const candidates = useQuery({
    queryKey: ["shift-candidates", dept.id, date.slice(0, 7), shift?.id ?? null],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shift_candidates", { _dept: dept.id, _date: date, _exclude: shift?.id ?? null });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ids = [...selected].sort();
  const stable = useDebounced(JSON.stringify([date, service.time, ids]), 350);
  const warnings = useQuery({
    queryKey: ["shift-warnings", dept.id, shift?.id ?? null, stable],
    enabled: valid && ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shift_warnings", {
        _dept: dept.id,
        _date: date,
        _time: service.time,
        _members: ids,
        _exclude: shift?.id ?? null,
      });
      if (error) throw error;
      return (data ?? []) as ShiftWarning[];
    },
  });

  const byMember = new Map<string, ShiftWarning[]>();
  for (const w of warnings.data ?? []) byMember.set(w.member_id, [...(byMember.get(w.member_id) ?? []), w]);
  const nameOf = (id: string) => candidates.data?.find((c) => c.member_id === id)?.full_name ?? "Voluntário";
  const flagged = [...byMember.keys()].filter((id) => selected.has(id));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("save_shift", {
        _dept: dept.id,
        _date: date,
        _service_name: service.name,
        _service_time: service.time,
        _member_ids: ids,
        _notes: notes.trim() || null,
        _shift_id: shift?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(shift ? "Escala atualizada." : "Escala criada. Os voluntários foram avisados.");
      void qc.invalidateQueries({ queryKey: ["dept-schedule"] });
      void qc.invalidateQueries({ queryKey: ["my-shifts"] });
      void qc.invalidateQueries({ queryKey: ["shift-candidates"] });
      onClose();
    },
    onError: (e) => toast.error(shiftError(e)),
  });

  const shown = (candidates.data ?? []).filter((c) => c.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const canSave = valid && !inPast && service.name.length > 0 && selected.size > 0 && !save.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{shift ? "Editar escala" : "Nova escala"} · {dept.name}</DialogTitle>
            <DialogDescription className="capitalize">{valid ? fmtShiftLong(date) : "Escolha a data"}</DialogDescription>
          </DialogHeader>

          <div className="my-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shift-date">Data</Label>
              <Input id="shift-date" type="date" min={todayBR()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shift-service">Culto</Label>
              <select
                id="shift-service"
                value={opt ? choice : "custom"}
                onChange={(e) => setChoice(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {options.map((o, i) => (
                  <option key={`${o.name}-${i}`} value={String(i)}>
                    {o.name}
                    {o.time ? ` · ${o.time.replace(":", "h")}` : ""}
                  </option>
                ))}
                <option value="custom">Outro culto ou horário…</option>
              </select>
            </div>
            {!opt && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="shift-name">Nome do culto *</Label>
                  <Input id="shift-name" value={customName} maxLength={80} onChange={(e) => setCustomName(e.target.value)} placeholder="Ex.: Culto de Jovens" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift-time">Horário</Label>
                  <Input id="shift-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {flagged.length > 0 && (
            <div role="status" className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> Atenção — isto é só um aviso, você pode escalar mesmo assim
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {flagged.flatMap((id) =>
                  (byMember.get(id) ?? []).map((w) => (
                    <li key={`${id}-${w.kind}-${w.detail}`}>
                      <strong className="text-foreground">{nameOf(id)}</strong> {w.detail}
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="shift-search">Voluntários ({selected.size} escalados)</Label>
              <Input id="shift-search" className="h-8 max-w-48" placeholder="Buscar nome" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2">
              {candidates.isLoading && <li className="p-2 text-sm text-muted-foreground">Carregando voluntários…</li>}
              {!candidates.isLoading && shown.length === 0 && (
                <li className="p-2 text-sm text-muted-foreground">
                  {(candidates.data ?? []).length === 0 ? "Este departamento ainda não tem voluntários aprovados." : "Ninguém com esse nome."}
                </li>
              )}
              {shown.map((c) => {
                const on = selected.has(c.member_id);
                const ws = on ? (byMember.get(c.member_id) ?? []) : [];
                return (
                  <li key={c.member_id}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${on ? "border-primary bg-primary-soft" : ""}`}>
                      <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => toggle(c.member_id, v === true)} aria-label={c.full_name} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{c.full_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.month_count} {c.month_count === 1 ? "escala" : "escalas"} em {monthLabel}
                          {c.has_account ? "" : " · sem conta (não recebe aviso no celular)"}
                        </span>
                        {ws.length > 0 && (
                          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-400">⚠ {ws.map((w) => w.detail).join(" · ")}</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {shift && selected.size === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Para tirar todo mundo, feche esta janela e use “Excluir escala” no cartão do culto.</p>
          )}

          <div className="mt-4 space-y-2">
            <Label htmlFor="shift-notes">Observação (opcional)</Label>
            <Textarea id="shift-notes" rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: chegar às 17h para a passagem de som." />
          </div>

          {inPast && <p className="mt-3 text-sm text-destructive">Escolha uma data de hoje em diante.</p>}

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSave}>
              {shift ? "Salvar alterações" : "Criar escala"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
