import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TitheDialog, type TitheRow } from "@/components/tithes/TitheDialog";
import { TitheTable, useDeleteTithe } from "@/components/tithes/TitheTable";
import { MONTHS, brl, dateBR, monthRefLabel } from "@/lib/church";
import { siteMeta } from "@/lib/site-query";

export const Route = createFileRoute("/_authenticated/painel/dizimos")({
  head: () => siteMeta("Dízimos — Comunidade Aava", "Histórico de dízimos dos membros."),
  component: TithesPage,
});

function TithesPage() {
  const { can, isLoading: loadingAccess } = useAccess();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState("todos");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; tithe: TitheRow | null }>({
    open: false,
    tithe: null,
  });
  const del = useDeleteTithe();

  const q = useQuery({
    queryKey: ["tithes", "all", year],
    enabled: can("view_finance"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tithes")
        .select("*, members(id, full_name)")
        .gte("paid_on", `${year}-01-01`)
        .lte("paid_on", `${year}-12-31`)
        .order("paid_on", { ascending: false });
      if (error) throw error;
      return data as TitheRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter(
      (t) =>
        (month === "todos" || t.paid_on.slice(5, 7) === month) &&
        (!term || (t.members?.full_name ?? "").toLowerCase().includes(term)),
    );
  }, [q.data, month, search]);

  if (loadingAccess) return null;
  if (!can("view_finance"))
    return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  const total = rows.reduce((s, t) => s + Number(t.amount), 0);
  const givers = new Set(rows.map((t) => t.member_id)).size;
  const average = rows.length ? total / rows.length : 0;
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  function exportCsv() {
    const head = ["Data", "Membro", "Referente a", "Forma de pagamento", "Valor", "Observação"];
    const lines = rows.map((t) => [
      dateBR(t.paid_on),
      t.members?.full_name ?? "",
      monthRefLabel(t.reference_month),
      t.payment_method ?? "",
      Number(t.amount).toFixed(2).replace(".", ","),
      t.notes ?? "",
    ]);
    const csv = [head, ...lines]
      .map((r) => r.map((c) => String(c).replace(/[;\n]/g, " ")).join(";"))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `dizimos-${year}${month === "todos" ? "" : `-${month}`}.csv`;
    a.click();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl text-foreground">Dízimos</h1>
        <div className="flex gap-2">
          {can("export_financial_reports") && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          )}
          {can("create_financial_transaction") && (
            <Button onClick={() => setDialog({ open: true, tithe: null })}>
              <Plus className="h-4 w-4" /> Registrar dízimo
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por membro"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {MONTHS.map((m, i) => (
              <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <dt className="text-sm text-muted-foreground">Total no período</dt>
          <dd className="mt-1 text-2xl font-semibold text-foreground">{brl(total)}</dd>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <dt className="text-sm text-muted-foreground">Membros que contribuíram</dt>
          <dd className="mt-1 text-2xl font-semibold text-foreground">{givers}</dd>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <dt className="text-sm text-muted-foreground">Valor médio por lançamento</dt>
          <dd className="mt-1 text-2xl font-semibold text-foreground">{brl(average)}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <TitheTable
          rows={rows}
          showMember
          loading={q.isLoading}
          {...(can("edit_financial_transaction")
            ? { onEdit: (t: TitheRow) => setDialog({ open: true, tithe: t }) }
            : {})}
          {...(can("delete_financial_transaction")
            ? {
                onDelete: (t: TitheRow) =>
                  confirm(`Excluir o dízimo de ${t.members?.full_name ?? "este membro"}?`) &&
                  del.mutate(t.id),
              }
            : {})}
        />
      </div>

      <TitheDialog
        open={dialog.open}
        tithe={dialog.tithe}
        onClose={() => setDialog({ open: false, tithe: null })}
      />
    </div>
  );
}
