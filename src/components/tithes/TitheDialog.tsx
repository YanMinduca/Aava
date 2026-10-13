import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAYMENT_METHODS, parseMoney } from "@/lib/church";

export type TitheRow = Tables<"tithes"> & { members?: { id: string; full_name: string } | null };

type Draft = {
  id?: string;
  member_id: string;
  amount: string;
  paid_on: string;
  reference_month: string; // formato YYYY-MM (campo <input type="month">)
  payment_method: string;
  notes: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function toDraft(t: TitheRow | null, memberId?: string): Draft {
  if (t) {
    return {
      id: t.id,
      member_id: t.member_id,
      amount: String(t.amount).replace(".", ","),
      paid_on: t.paid_on,
      reference_month: t.reference_month?.slice(0, 7) ?? t.paid_on.slice(0, 7),
      payment_method: t.payment_method ?? "",
      notes: t.notes ?? "",
    };
  }
  return {
    member_id: memberId ?? "",
    amount: "",
    paid_on: today(),
    reference_month: today().slice(0, 7),
    payment_method: "",
    notes: "",
  };
}

/**
 * Cria ou edita um dízimo.
 * - `memberId` fixo (perfil do membro): o membro não pode ser trocado.
 * - sem `memberId` (tela geral de dízimos): mostra a lista para escolher o membro.
 */
export function TitheDialog({
  open,
  onClose,
  tithe,
  memberId,
  memberName,
}: {
  open: boolean;
  onClose: () => void;
  tithe: TitheRow | null;
  memberId?: string;
  memberName?: string;
}) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => toDraft(tithe, memberId));

  useEffect(() => {
    if (open) setD(toDraft(tithe, memberId));
  }, [open, tithe, memberId]);

  const members = useQuery({
    queryKey: ["members-options"],
    enabled: open && !memberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name")
        .neq("approval_status", "pendente")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amount = parseMoney(d.amount);
      if (!d.member_id) throw new Error("Escolha o membro.");
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Informe um valor maior que zero.");
      if (!d.paid_on) throw new Error("Informe a data do dízimo.");
      const payload = {
        member_id: d.member_id,
        amount,
        paid_on: d.paid_on,
        reference_month: d.reference_month ? `${d.reference_month}-01` : null,
        payment_method: d.payment_method || null,
        notes: d.notes.trim() || null,
      };
      const { error } = d.id
        ? await supabase.from("tithes").update(payload).eq("id", d.id)
        : await supabase.from("tithes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(d.id ? "Dízimo atualizado" : "Dízimo registrado");
      qc.invalidateQueries({ queryKey: ["tithes"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{d.id ? "Editar dízimo" : "Registrar dízimo"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Membro *</Label>
            {memberId ? (
              <Input disabled value={memberName ?? ""} />
            ) : (
              <Select value={d.member_id} onValueChange={(v) => setD({ ...d, member_id: v })}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={members.isLoading ? "Carregando..." : "Selecione o membro"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={d.amount}
                onChange={(e) => setD({ ...d, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data do dízimo *</Label>
              <Input
                type="date"
                value={d.paid_on}
                onChange={(e) => setD({ ...d, paid_on: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mês de referência</Label>
              <Input
                type="month"
                value={d.reference_month}
                onChange={(e) => setD({ ...d, reference_month: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Forma de pagamento</Label>
              <Select
                value={d.payment_method}
                onValueChange={(v) => setD({ ...d, payment_method: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={d.notes}
              onChange={(e) => setD({ ...d, notes: e.target.value })}
            />
          </div>

          <Button type="submit" className="w-full" disabled={save.isPending}>
            {d.id ? "Salvar alterações" : "Registrar dízimo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
