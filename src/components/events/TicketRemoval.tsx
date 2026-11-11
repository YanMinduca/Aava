import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { eventError, fmtDateTime, moneyBR, TICKET_STATUS } from "@/lib/events";
import { formatShortCode } from "@/lib/images";
import {
  normalizeReason,
  previewRemoval,
  removalReasonIsValid,
  REMOVAL_REASON_MAX,
} from "@/lib/event-removal";
import type { Tables } from "@/integrations/supabase/types";

type Reg = Pick<Tables<"event_registrations">, "id" | "status" | "quantity" | "unit_price">;

/** Ingressos de uma inscrição: confere cada um e remove 1 ou mais, sempre com uma observação explicando o motivo. */
export function TicketRemoval({
  reg,
  tickets,
  removals,
  paidSum,
  onChange,
}: {
  reg: Reg;
  tickets: Tables<"event_tickets">[];
  removals: Tables<"event_ticket_removals">[];
  paidSum: number;
  onChange: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState(1);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const sorted = [...tickets].sort((a, b) => a.seq - b.seq);
  const issued = sorted.length > 0;
  const reasonById = new Map(removals.map((r) => [r.id, r]));
  const canRemove = reg.status !== "cancelled";
  const removing = issued ? picked.size : qty;
  const preview = previewRemoval({
    unitPrice: Number(reg.unit_price),
    quantity: reg.quantity,
    removing,
    paidSum,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("remove_event_tickets", {
        _reg: reg.id,
        _reason: normalizeReason(reason),
        ...(issued ? { _ticket_ids: [...picked] } : { _quantity: qty }),
      });
      if (error) throw error;
      return data as { refund_due?: number } | null;
    },
    onSuccess: (res) => {
      const due = Number(res?.refund_due ?? 0);
      toast.success(
        due > 0
          ? `Ingresso(s) removido(s). Valor a devolver: ${moneyBR(due)}.`
          : "Ingresso(s) removido(s).",
      );
      setPicked(new Set());
      setQty(1);
      setReason("");
      setOpen(false);
      onChange();
    },
    onError: (e) => toast.error(eventError(e)),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_ticket_removal_log", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro enviado para a lixeira.");
      onChange();
    },
    onError: (e) => toast.error(eventError(e)),
  });

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <div className="space-y-3">
      <p className="font-medium text-foreground">Ingressos ({reg.quantity})</p>

      {issued ? (
        <ul className="divide-y rounded-xl border">
          {sorted.map((t) => {
            const removal = t.removal_id ? reasonById.get(t.removal_id) : undefined;
            const removable = canRemove && t.status === "valid";
            return (
              <li key={t.id} className="flex items-start gap-3 p-3">
                {canRemove && (
                  <Checkbox
                    className="mt-1"
                    aria-label={`Remover o ingresso de ${t.holder_name}`}
                    disabled={!removable}
                    checked={picked.has(t.id)}
                    onCheckedChange={(on) => toggle(t.id, on === true)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{t.holder_name}</p>
                  <p className="font-mono text-xs tracking-widest text-muted-foreground">
                    {formatShortCode(t.short_code)}
                  </p>
                  <Badge variant={t.status === "valid" ? "outline" : "secondary"} className="mt-1">
                    {removal ? "Removido" : (TICKET_STATUS[t.status] ?? t.status)}
                  </Badge>
                  {t.status === "checked_in" && canRemove && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      desfaça a presença no check-in para poder remover
                    </span>
                  )}
                  {removal && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Motivo: {removal.reason} · {fmtDateTime(removal.removed_at)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">
          {reg.quantity} {reg.quantity === 1 ? "ingresso" : "ingressos"}, ainda não emitidos (saem
          depois do pagamento).
        </p>
      )}

      {removals.length > 0 && (
        <div className="rounded-xl border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Histórico de remoções</p>
          <ul className="mt-1 space-y-1">
            {[...removals]
              .sort((a, b) => b.removed_at.localeCompare(a.removed_at))
              .map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <span>
                    {fmtDateTime(r.removed_at)} — {r.tickets_removed}{" "}
                    {r.tickets_removed === 1 ? "ingresso" : "ingressos"}
                    {r.registration_cancelled ? " (inscrição cancelada)" : ""}: {r.reason}
                    {Number(r.refund_due) > 0 ? ` · a devolver ${moneyBR(r.refund_due)}` : ""}
                  </span>
                  <button
                    type="button"
                    aria-label="Apagar este registro do histórico"
                    disabled={deleteLog.isPending}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      confirm("Apagar este registro do histórico? Ele fica na lixeira por 30 dias.") && deleteLog.mutate(r.id)
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {canRemove && !open && (
        <Button
          type="button"
          variant="outline"
          disabled={issued ? picked.size === 0 : false}
          onClick={() => setOpen(true)}
        >
          {issued ? `Remover selecionados (${picked.size})` : "Remover ingressos"}
        </Button>
      )}

      {canRemove && open && (
        <div className="space-y-3 rounded-xl border border-destructive/30 p-4">
          {!issued && (
            <div className="space-y-1.5">
              <Label htmlFor={`rm-qty-${reg.id}`}>Quantos ingressos remover?</Label>
              <Input
                id={`rm-qty-${reg.id}`}
                type="number"
                min={1}
                max={reg.quantity}
                value={qty}
                onChange={(e) =>
                  setQty(Math.max(1, Math.min(reg.quantity, Number(e.target.value) || 1)))
                }
                className="max-w-28"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`rm-reason-${reg.id}`}>
              Observação: por que o ingresso está sendo removido? *
            </Label>
            <Textarea
              id={`rm-reason-${reg.id}`}
              rows={3}
              maxLength={REMOVAL_REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: pessoa desistiu, inscrição duplicada, pagamento não identificado…"
            />
            <p className="text-xs text-muted-foreground">
              Fica registrada e a pessoa inscrita vê esta observação em “Meu cadastro”.
            </p>
          </div>
          <p className="text-sm text-foreground" data-testid="removal-summary">
            {preview.cancelsRegistration
              ? "Como todos os ingressos serão removidos, a inscrição inteira será cancelada."
              : `A inscrição fica com ${preview.newQuantity} ${preview.newQuantity === 1 ? "ingresso" : "ingressos"}${Number(reg.unit_price) > 0 ? ` (${moneyBR(preview.newTotal)})` : ""}. As vagas removidas voltam para o lote.`}
            {preview.refundDue > 0 && (
              <span className="block font-medium">
                Já pago a devolver: {moneyBR(preview.refundDue)} (a devolução é feita fora do
                sistema).
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending || !removalReasonIsValid(reason) || removing < 1}
              onClick={() => remove.mutate()}
            >
              Confirmar remoção
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => setOpen(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
