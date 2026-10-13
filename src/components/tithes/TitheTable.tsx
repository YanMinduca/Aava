import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { brl, dateBR, monthRefLabel } from "@/lib/church";
import type { TitheRow } from "./TitheDialog";

export function useDeleteTithe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tithes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dízimo excluído");
      qc.invalidateQueries({ queryKey: ["tithes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function TitheTable({
  rows,
  showMember,
  onEdit,
  onDelete,
  loading,
}: {
  rows: TitheRow[];
  showMember?: boolean;
  onEdit?: (t: TitheRow) => void;
  onDelete?: (t: TitheRow) => void;
  loading?: boolean;
}) {
  const cols = 4 + (showMember ? 1 : 0) + (onEdit || onDelete ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            <th className="p-4 font-medium">Data</th>
            {showMember && <th className="p-4 font-medium">Membro</th>}
            <th className="p-4 font-medium">Referente a</th>
            <th className="p-4 font-medium">Forma</th>
            <th className="p-4 text-right font-medium">Valor</th>
            {(onEdit || onDelete) && <th className="p-4" />}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td className="p-4 text-muted-foreground" colSpan={cols}>
                Carregando...
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td className="p-6 text-center text-muted-foreground" colSpan={cols}>
                Nenhum dízimo registrado neste período.
              </td>
            </tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="whitespace-nowrap p-4 text-foreground">{dateBR(t.paid_on)}</td>
              {showMember && (
                <td className="p-4">
                  {t.members ? (
                    <Link
                      to="/painel/membro/$id"
                      params={{ id: t.member_id }}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {t.members.full_name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              )}
              <td className="p-4 text-muted-foreground">{monthRefLabel(t.reference_month)}</td>
              <td className="p-4 text-muted-foreground">
                {t.payment_method ?? "—"}
                {t.notes && <p className="text-xs">{t.notes}</p>}
              </td>
              <td className="whitespace-nowrap p-4 text-right font-medium text-foreground">
                {brl(Number(t.amount))}
              </td>
              {(onEdit || onDelete) && (
                <td className="whitespace-nowrap p-4 text-right">
                  {onEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(t)}
                      aria-label="Editar dízimo"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(t)}
                      aria-label="Excluir dízimo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
