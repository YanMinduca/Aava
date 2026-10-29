import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Clock, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteContent } from "@/lib/site-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { MonthGrid, gridBounds } from "@/components/shifts/MonthGrid";
import { ShiftEditor } from "@/components/shifts/ShiftEditor";
import { MyShiftActions } from "@/components/shifts/MyShifts";
import {
  STATUS_LABEL,
  fmtShiftLong,
  fmtShiftShort,
  fmtShiftTime,
  groupShifts,
  parseISODate,
  shiftError,
  toISODate,
  todayBR,
  type MyShift,
  type Shift,
  type ShiftMember,
  type ShiftRow,
} from "@/lib/shifts";

type Dept = { id: string; name: string; can_manage: boolean };

function useSchedule(dept: Dept, from: string, to: string, enabled = true, tag = "month") {
  return useQuery({
    queryKey: ["dept-schedule", dept.id, tag, from, to],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dept_schedule", { _dept: dept.id, _from: from, _to: to });
      if (error) throw error;
      return groupShifts((data ?? []) as ShiftRow[]);
    },
  });
}

const statusBadge = (m: ShiftMember) =>
  m.status === "confirmed" ? (
    <Badge className="bg-success text-success-foreground">{STATUS_LABEL.confirmed}</Badge>
  ) : m.status === "change_requested" ? (
    <Badge variant="destructive">{STATUS_LABEL.change_requested}</Badge>
  ) : (
    <Badge variant="secondary">{STATUS_LABEL.pending}</Badge>
  );

/** Calendário da escala de um departamento: o líder cria e edita; os voluntários só veem e respondem. */
export function DeptSchedule({ dept }: { dept: Dept }) {
  const content = useSiteContent();
  const [month, setMonth] = useState(() => new Date());
  const [day, setDay] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<{ shift: Shift | null; date: string } | null>(null);
  const today = todayBR();

  const grid = gridBounds(month);
  const from = toISODate(grid.start);
  const to = toISODate(grid.end);
  const monthQ = useSchedule(dept, from, to);
  const horizon = toISODate(new Date(Date.now() + 120 * 86400_000));
  const upcoming = useSchedule(dept, today, horizon, dept.can_manage, "upcoming");

  const shifts = monthQ.data ?? [];
  const dayIso = toISODate(day);
  const dayShifts = shifts.filter((s) => s.date === dayIso);
  const requests = (upcoming.data ?? []).flatMap((s) => s.members.filter((m) => m.status === "change_requested").map((m) => ({ shift: s, member: m })));

  const goTo = (iso: string) => {
    const d = parseISODate(iso);
    setMonth(d);
    setDay(d);
  };

  return (
    <section aria-label={`Escala do departamento ${dept.name}`}>
      {dept.can_manage && requests.length > 0 && (
        <div className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-foreground">
            {requests.length} {requests.length === 1 ? "pedido de alteração aguardando você" : "pedidos de alteração aguardando você"}
          </p>
          <ul className="mt-3 space-y-2">
            {requests.map(({ shift, member }) => (
              <li key={`${shift.id}-${member.memberId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background p-3">
                <span>
                  <strong className="text-foreground">{member.name}</strong> · {shift.name} · <span className="capitalize">{fmtShiftShort(shift.date)}</span>
                  {member.changeReason && <span className="block text-muted-foreground">Motivo: {member.changeReason}</span>}
                </span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => goTo(shift.date)}>
                  Abrir no calendário
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MonthGrid
        month={month}
        shifts={shifts}
        selected={day}
        today={today}
        onSelect={(d) => {
          setDay(d);
          if (d.getMonth() !== month.getMonth()) setMonth(d);
        }}
        onMonthChange={setMonth}
      />

      <div className="mt-6 min-w-0 space-y-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl capitalize text-foreground">{fmtShiftLong(dayIso)}</h3>
          {dept.can_manage && dayIso >= today && (
            <Button size="sm" onClick={() => setEditing({ shift: null, date: dayIso })}>
              <CalendarPlus className="h-4 w-4" /> Escalar este dia
            </Button>
          )}
        </div>

        {monthQ.isLoading && <p className="text-sm text-muted-foreground">Carregando a escala…</p>}
        {!monthQ.isLoading && dayShifts.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            Nenhum culto escalado neste dia.{dept.can_manage && dayIso >= today ? " Use “Escalar este dia” para montar a escala." : ""}
          </p>
        )}
        <div className="grid gap-4 xl:grid-cols-2">
          {dayShifts.map((s) => (
            <ShiftCard key={s.id} shift={s} dept={dept} past={s.date < today} onEdit={() => setEditing({ shift: s, date: s.date })} />
          ))}
        </div>
      </div>

      {editing && (
        <ShiftEditor
          dept={dept}
          initialDate={editing.date >= today ? editing.date : today}
          shift={editing.shift}
          schedule={content.schedule}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function ShiftCard({ shift, dept, past, onEdit }: { shift: Shift; dept: Dept; past: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["dept-schedule"] });
    void qc.invalidateQueries({ queryKey: ["my-shifts"] });
  };
  const onError = (e: unknown) => toast.error(shiftError(e));

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("delete_shift", { _shift: shift.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Escala apagada.");
      refresh();
    },
    onError,
  });
  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc("remove_shift_member", { _shift: shift.id, _member: memberId });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      toast.success(result === "shift_deleted" ? "Era a última pessoa: a escala deste culto foi apagada." : "Pessoa removida da escala.");
      refresh();
    },
    onError,
  });
  const confirmFor = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc("leader_confirm_shift", { _shift: shift.id, _member: memberId });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError,
  });
  const keep = useMutation({
    mutationFn: async ({ memberId, note }: { memberId: string; note: string }) => {
      const { error } = await supabase.rpc("resolve_shift_change", { _shift: shift.id, _member: memberId, ...(note ? { _note: note } : {}) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pronto: a pessoa foi mantida na escala e avisada.");
      refresh();
    },
    onError,
  });

  const me = shift.members.find((m) => m.isMe);
  const time = fmtShiftTime(shift.time);
  const asMine: MyShift | null = me
    ? {
        shift_id: shift.id,
        department_id: dept.id,
        department_name: dept.name,
        shift_date: shift.date,
        service_name: shift.name,
        service_time: shift.time,
        notes: shift.notes,
        status: me.status,
        change_reason: me.changeReason,
        leader_note: me.leaderNote,
        team: shift.members.filter((m) => !m.isMe).map((m) => m.name),
      }
    : null;

  return (
    <article className="rounded-2xl border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold text-foreground">{shift.name}</h4>
          {time && (
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden /> {time}
            </p>
          )}
        </div>
        {dept.can_manage && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={past} onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <ConfirmButton
              variant="outline"
              disabled={remove.isPending}
              title="Excluir esta escala?"
              description={`A escala de ${shift.name} em ${fmtShiftShort(shift.date)} será apagada${past ? "" : " e os voluntários escalados serão avisados"}.`}
              confirmLabel="Excluir escala"
              onConfirm={() => remove.mutate()}
            >
              <Trash2 className="h-4 w-4" /> Excluir escala
            </ConfirmButton>
          </div>
        )}
      </header>
      {shift.notes && <p className="mt-2 text-sm text-muted-foreground">Observação: {shift.notes}</p>}

      <ul className="mt-4 divide-y">
        {shift.members.map((m) => (
          <li key={m.memberId} className="py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">
                {m.name}
                {m.isMe ? " (você)" : ""}
              </span>
              {statusBadge(m)}
              {dept.can_manage && !m.hasAccount && <span className="text-xs text-muted-foreground">sem conta</span>}
              {dept.can_manage && (
                <span className="ml-auto flex flex-wrap gap-2">
                  {!past && m.status !== "confirmed" && !m.hasAccount && (
                    <Button size="sm" variant="outline" disabled={confirmFor.isPending} onClick={() => confirmFor.mutate(m.memberId)}>
                      <Check className="h-4 w-4" /> Marcar ciente
                    </Button>
                  )}
                  <ConfirmButton
                    variant="ghost"
                    disabled={removeMember.isPending}
                    ariaLabel={`Remover ${m.name} da escala`}
                    title={`Remover ${m.name} da escala?`}
                    description={
                      shift.members.length === 1
                        ? "Esta é a última pessoa escalada: ao remover, a escala deste culto será apagada."
                        : past
                          ? "Ela sai da lista desta escala."
                          : "Ela sai da escala e é avisada no celular."
                    }
                    confirmLabel="Remover"
                    onConfirm={() => removeMember.mutate(m.memberId)}
                  >
                    <Trash2 className="h-4 w-4" /> Remover
                  </ConfirmButton>
                </span>
              )}
            </div>
            {dept.can_manage && m.status === "change_requested" && (
              <ChangeRequestPanel
                reason={m.changeReason}
                disabled={past || keep.isPending}
                onKeep={(note) => keep.mutate({ memberId: m.memberId, note })}
              />
            )}
          </li>
        ))}
      </ul>

      {asMine && !past && <MyShiftActions shift={asMine} />}
    </article>
  );
}

/** Para o líder: vê o motivo e decide. Para trocar a pessoa, basta editar a escala e desmarcá-la. */
function ChangeRequestPanel({ reason, disabled, onKeep }: { reason: string | null; disabled: boolean; onKeep: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-foreground">Motivo do pedido: {reason ?? "—"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Para aceitar, clique em “Editar” e desmarque a pessoa (ela é avisada). Para manter, responda abaixo.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input className="h-8 max-w-64" placeholder="Resposta (opcional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onKeep(note.trim())}>
          Manter na escala
        </Button>
      </div>
    </div>
  );
}
