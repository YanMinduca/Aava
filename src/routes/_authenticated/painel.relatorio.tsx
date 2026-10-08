import { createFileRoute, Link } from "@tanstack/react-router";
import { siteMeta } from '@/lib/site-query';
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { CHURCH, MONTHS, brl, dateBR } from "@/lib/church";
import { byCategory, downloadCsv, expenses, goalProgress, inPeriod, incomes, sum, txCsvRows } from "@/lib/finance";
import { Button } from "@/components/ui/button";

type Tipo = "mensal" | "anual" | "receitas" | "despesas" | "completo";

export const Route = createFileRoute("/_authenticated/painel/relatorio")({
  head: () => siteMeta('Relatórios financeiros — Comunidade Aava', 'Prestação de contas e relatórios financeiros da comunidade.'),
  validateSearch: (s: Record<string, unknown>) => ({
    tipo: (["mensal", "anual", "receitas", "despesas", "completo"].includes(String(s["tipo"])) ? s["tipo"] : "mensal") as Tipo,
    ano: Number(s["ano"]) || new Date().getFullYear(),
    mes: Number(s["mes"]) || new Date().getMonth() + 1,
  }),
  component: ReportPage,
});

const TITLES: Record<Tipo, string> = { mensal: "Relatório mensal", anual: "Relatório anual", receitas: "Relatório de receitas", despesas: "Relatório de despesas", completo: "Prestação de contas" };

function ReportPage() {
  const { tipo, ano, mes } = Route.useSearch();
  const { can } = useAccess();
  const q = useQuery({
    queryKey: ["report", ano],
    queryFn: async () => {
      const [t, g] = await Promise.all([
        supabase.from("financial_transactions").select("*").order("occurred_on"),
        supabase.from("financial_goals").select("*"),
      ]);
      return { all: t.data ?? [], goals: g.data ?? [] };
    },
  });
  if (!can("export_financial_reports")) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;
  if (!q.data) return null;
  const { all, goals } = q.data;
  let list = tipo === "mensal" ? inPeriod(all, ano, mes) : inPeriod(all, ano);
  if (tipo === "receitas") list = incomes(list);
  if (tipo === "despesas") list = expenses(list);
  const inc = incomes(list), exp = expenses(list);
  const period = tipo === "mensal" ? `${MONTHS[mes - 1]} de ${ano}` : `Ano de ${ano}`;
  const showMonthly = tipo !== "mensal";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/painel/financeiro" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv(`${tipo}-${ano}${tipo === "mensal" ? "-" + mes : ""}.csv`, txCsvRows(list))}><Download className="h-4 w-4" /> CSV</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir / Salvar PDF</Button>
        </div>
      </div>

      <article className="rounded-2xl border bg-card p-8 print:border-0 print:p-0">
        <header className="border-b pb-5">
          <p className="text-sm text-muted-foreground">{CHURCH.name} · {CHURCH.city}</p>
          <h1 className="mt-1 text-3xl text-foreground">{TITLES[tipo]}</h1>
          <p className="text-muted-foreground">{period} · gerado em {dateBR(new Date().toISOString())}</p>
        </header>

        {tipo !== "despesas" && <Block title="Receitas" rows={byCategory(inc)} total={sum(inc)} />}
        {tipo !== "receitas" && <Block title="Despesas" rows={byCategory(exp)} total={sum(exp)} />}
        {tipo !== "receitas" && tipo !== "despesas" && (
          <div className="mt-6 flex justify-between rounded-xl bg-primary-soft px-5 py-4 text-lg font-semibold">
            <span className="text-foreground">Saldo</span>
            <span className="tabular-nums text-foreground">{brl(sum(inc) - sum(exp))}</span>
          </div>
        )}

        {showMonthly && (
          <section className="mt-8">
            <h2 className="text-xl text-foreground">Mês a mês</h2>
            <table className="mt-3 w-full text-sm">
              <thead className="border-b text-left text-muted-foreground"><tr><th className="py-2">Mês</th>{tipo !== "despesas" && <th className="py-2 text-right">Receitas</th>}{tipo !== "receitas" && <th className="py-2 text-right">Despesas</th>}{tipo !== "receitas" && tipo !== "despesas" && <th className="py-2 text-right">Saldo</th>}</tr></thead>
              <tbody>
                {MONTHS.map((m, i) => {
                  const l = inPeriod(all, ano, i + 1);
                  const a = sum(incomes(l)), b = sum(expenses(l));
                  return (
                    <tr key={m} className="border-b last:border-0">
                      <td className="py-2 text-foreground">{m}</td>
                      {tipo !== "despesas" && <td className="py-2 text-right tabular-nums">{brl(a)}</td>}
                      {tipo !== "receitas" && <td className="py-2 text-right tabular-nums">{brl(b)}</td>}
                      {tipo !== "receitas" && tipo !== "despesas" && <td className="py-2 text-right tabular-nums">{brl(a - b)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {tipo === "completo" && goals.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xl text-foreground">Metas financeiras</h2>
            <div className="mt-3 space-y-2 text-sm">
              {goals.map((g) => {
                const p = goalProgress(g, all);
                return (
                  <div key={g.id} className="flex justify-between border-b py-2">
                    <span className="text-foreground">{g.title}</span>
                    <span className="tabular-nums text-muted-foreground">{brl(p.raised)} / {brl(p.target)} ({p.pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-xl text-foreground">Lançamentos</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b text-left text-muted-foreground"><tr><th className="py-2">Data</th><th className="py-2">Categoria</th><th className="py-2">Descrição</th><th className="py-2">Método</th><th className="py-2 text-right">Valor</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Nenhum lançamento.</td></tr>}
              {list.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{dateBR(t.occurred_on)}</td>
                  <td className="py-2 text-foreground">{t.category}</td>
                  <td className="py-2 text-muted-foreground">{t.description}</td>
                  <td className="py-2 text-muted-foreground">{t.payment_method}</td>
                  <td className={`py-2 text-right tabular-nums ${t.kind === "entrada" ? "text-success" : "text-destructive"}`}>{t.kind === "entrada" ? "+" : "−"} {brl(Number(t.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {tipo === "completo" && (
          <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-sm text-muted-foreground">
            <div className="border-t pt-2">Responsável financeiro</div>
            <div className="border-t pt-2">Presidente / CEO</div>
          </footer>
        )}
      </article>
    </div>
  );
}

function Block({ title, rows, total }: { title: string; rows: { name: string; value: number }[]; total: number }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-2 text-sm">
        {rows.length === 0 && <p className="py-2 text-muted-foreground">Nenhum lançamento.</p>}
        {rows.map((r) => (
          <div key={r.name} className="flex justify-between border-b py-2"><span className="text-foreground">{r.name}</span><span className="tabular-nums text-foreground">{brl(r.value)}</span></div>
        ))}
        <div className="flex justify-between py-2 font-semibold"><span className="text-foreground">Total</span><span className="tabular-nums text-foreground">{brl(total)}</span></div>
      </div>
    </section>
  );
}
