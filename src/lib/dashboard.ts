import { goalProgress, type Goal, type Tx } from "@/lib/finance";

type TxLite = Pick<Tx, "kind" | "category" | "member_id" | "occurred_on">;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type TithersSummary = { current: number; previous: number; delta: number; trend: "up" | "down" | "same" };

/** Quantas pessoas diferentes dizimaram no mês atual e no anterior (dízimos sem membro não entram). */
export function tithersSummary(all: TxLite[], now = new Date()): TithersSummary {
  const cur = monthKey(now);
  const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const count = (key: string) =>
    new Set(
      all.filter((t) => t.kind === "entrada" && t.category === "Dízimos" && t.member_id && t.occurred_on.startsWith(key)).map((t) => t.member_id),
    ).size;
  const current = count(cur);
  const previous = count(prev);
  const delta = current - previous;
  return { current, previous, delta, trend: delta > 0 ? "up" : delta < 0 ? "down" : "same" };
}

type EventLite = { starts_at: string; ends_at: string | null; published: boolean };

/** Eventos publicados que ainda não terminaram, do mais próximo para o mais distante. */
export function upcomingEvents<T extends EventLite>(events: T[], now = new Date()): T[] {
  return events
    .filter((e) => e.published && new Date(e.ends_at ?? e.starts_at) >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

/** Metas em andamento com o progresso calculado; as de prazo mais próximo primeiro. */
export function activeGoals(goals: Goal[], tx: Tx[], limit = 3) {
  return goals
    .filter((g) => g.status === "em_andamento")
    .map((g) => ({ goal: g, ...goalProgress(g, tx) }))
    .sort((a, b) => (a.goal.deadline ?? "9999-12-31").localeCompare(b.goal.deadline ?? "9999-12-31"))
    .slice(0, limit);
}
