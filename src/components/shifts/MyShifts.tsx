import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, Clock, MessageSquareWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fmtShiftLong, fmtShiftTime, shiftError, type MyShift } from "@/lib/shifts";

/** Próximas escalas da própria pessoa (usado no dashboard e em "Escalas"). */
export function useMyShifts(limit = 20) {
  return useQuery({
    queryKey: ["my-shifts", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_shifts", { _limit: limit });
      if (error) throw error;
      return (data ?? []) as MyShift[];
    },
  });
}

/** Pede o motivo do pedido de alteração (obrigatório). */
export function ChangeRequestDialog({
  open,
  onOpenChange,
  title,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) onSubmit(reason.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Solicitar alteração da escala</DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-2">
            <Label htmlFor="shift-reason">Motivo *</Label>
            <Textarea
              id="shift-reason"
              value={reason}
              maxLength={300}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: estarei viajando nesse dia."
            />
            <p className="text-xs text-muted-foreground">O líder do departamento recebe o seu pedido e o motivo. {reason.length}/300</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!ok || busy}>
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Botões e situação de uma escala para quem foi escalado: "Estou ciente" e "Solicitar alteração". */
export function MyShiftActions({ shift }: { shift: MyShift }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["my-shifts"] });
    void qc.invalidateQueries({ queryKey: ["dept-schedule"] });
  };

  const ack = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ack_shift", { _shift: shift.shift_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Obrigado! Seu ciente foi registrado.");
      refresh();
    },
    onError: (e) => toast.error(shiftError(e)),
  });

  const change = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("request_shift_change", { _shift: shift.shift_id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pedido enviado ao líder do departamento.");
      setAsking(false);
      refresh();
    },
    onError: (e) => toast.error(shiftError(e)),
  });

  const label = `${shift.department_name} · ${shift.service_name} · ${fmtShiftLong(shift.shift_date)}`;

  return (
    <div className="mt-4">
      {shift.status === "confirmed" && (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <Check className="h-4 w-4" aria-hidden /> Você está ciente desta escala.
        </p>
      )}
      {shift.status === "change_requested" && (
        <div className="rounded-lg border border-primary/30 bg-primary-soft p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <MessageSquareWarning className="h-4 w-4 text-primary" aria-hidden /> Alteração solicitada: aguardando o líder
          </p>
          {shift.change_reason && <p className="mt-1 text-muted-foreground">Seu motivo: {shift.change_reason}</p>}
        </div>
      )}
      {shift.leader_note && shift.status === "pending" && (
        <p className="mb-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">Resposta do líder: {shift.leader_note}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {shift.status !== "confirmed" && (
          <Button disabled={ack.isPending} onClick={() => ack.mutate()}>
            <Check className="h-4 w-4" /> Estou ciente
          </Button>
        )}
        <Button variant="outline" disabled={change.isPending} onClick={() => setAsking(true)}>
          {shift.status === "change_requested" ? "Mudar o pedido" : "Solicitar alteração"}
        </Button>
      </div>

      {asking && <ChangeRequestDialog open onOpenChange={setAsking} title={label} busy={change.isPending} onSubmit={(r) => change.mutate(r)} />}
    </div>
  );
}

/** Dashboard: "Próxima escala" com o botão "Estou ciente" logo abaixo. Some se a pessoa não tem escala futura. */
export function NextShiftCard() {
  const q = useMyShifts(5);
  const next = q.data?.[0];
  if (!next) return null;
  const more = (q.data?.length ?? 1) - 1;
  const time = fmtShiftTime(next.service_time);

  return (
    <section className="mt-6 rounded-2xl border bg-card p-6" aria-labelledby="next-shift-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="next-shift-title" className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" aria-hidden /> Próxima escala
        </h2>
        <Badge variant="secondary">{next.department_name}</Badge>
      </div>

      <p className="mt-3 font-display text-2xl capitalize text-foreground">{fmtShiftLong(next.shift_date)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-foreground">
        <span className="font-medium">{next.service_name}</span>
        {time && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden /> {time}
          </span>
        )}
      </p>
      {next.team.length > 0 && <p className="mt-2 text-sm text-muted-foreground">Com: {next.team.join(", ")}</p>}
      {next.notes && <p className="mt-2 text-sm text-muted-foreground">Observação do líder: {next.notes}</p>}

      <MyShiftActions shift={next} />

      <p className="mt-4 text-xs text-muted-foreground">
        <Link to="/painel/escalas" className="text-primary underline">
          Ver todas as escalas
        </Link>
        {more > 0 ? ` · mais ${more} ${more === 1 ? "escala" : "escalas"} à frente` : ""}
      </p>
    </section>
  );
}
