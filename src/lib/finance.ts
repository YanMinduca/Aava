import type { Tables } from "@/integrations/supabase/types";

export type Tx = Tables<"financial_transactions">;
export type Goal = Tables<"financial_goals">;

export const sum = (l: Tx[]) => l.reduce((s, t) => s + Number(t.amount), 0);
export const incomes = (l: Tx[]) => l.filter((t) => t.kind === "entrada");
export const expenses = (l: Tx[]) => l.filter((t) => t.kind === "saida");

export function byCategory(l: Tx[]) {
  const m: Record<string, number> = {};
  l.forEach((t) => (m[t.category] = (m[t.category] ?? 0) + Number(t.amount)));
  return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function inPeriod(l: Tx[], year: number, month?: number | null) {
  const p = month ? `${year}-${String(month).padStart(2, "0")}` : `${year}`;
  return l.filter((t) => t.occurred_on.startsWith(p));
}

/** Goal progress: monthly goals count the current month; others the start..end range. */
export function goalProgress(g: Goal, all: Tx[]) {
  let raised: number;
  if (g.manual_amount !== null && !g.category) raised = Number(g.manual_amount);
  else {
    let from = g.start_date ?? "0000-01-01";
    let to = g.deadline ?? "9999-12-31";
    if (g.recurrence === "mensal") {
      const d = new Date();
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      from = `${ym}-01`;
      to = `${ym}-31`;
    }
    raised = sum(all.filter((t) => t.kind === "entrada" && (!g.category || t.category === g.category) && t.occurred_on >= from && t.occurred_on <= to));
  }
  const target = Number(g.target_amount);
  return { raised, target, remaining: Math.max(0, target - raised), pct: Math.min(100, (raised / target) * 100) };
}

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map((c) => String(c ?? "").replace(/[;\n]/g, " ")).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = name;
  a.click();
}

export const txCsvRows = (l: Tx[]) => [
  ["Data", "Tipo", "Categoria", "Descrição", "Responsável", "Método", "Observação", "Valor"],
  ...l.map((t) => [t.occurred_on.split("-").reverse().join("/"), t.kind === "entrada" ? "Receita" : "Despesa", t.category, t.description, t.responsible, t.payment_method, t.notes, String(t.amount).replace(".", ",")]),
];
