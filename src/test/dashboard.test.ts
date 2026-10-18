import { describe, expect, it } from "vitest";
import { activeGoals, tithersSummary, upcomingEvents } from "@/lib/dashboard";
import type { Goal, Tx } from "@/lib/finance";

const tx = (member_id: string | null, occurred_on: string, category = "Dízimos", kind = "entrada") => ({ kind, category, member_id, occurred_on }) as Tx;
const NOW = new Date(2026, 9, 18); // 18/10/2026

describe("resumo de dizimistas", () => {
  it("conta pessoas diferentes por mês e compara com o mês anterior", () => {
    const all = [
      tx("a", "2026-10-02"), tx("a", "2026-10-15"), tx("b", "2026-10-05"), tx("c", "2026-10-09"), // outubro: a, b, c
      tx("a", "2026-09-03"), tx("b", "2026-09-10"), // setembro: a, b
      tx(null, "2026-10-10"), // dízimo sem membro não conta
      tx("d", "2026-10-11", "Ofertas"), // oferta não conta
      tx("e", "2026-10-12", "Dízimos", "saida"), // saída não conta
    ];
    expect(tithersSummary(all, NOW)).toEqual({ current: 3, previous: 2, delta: 1, trend: "up" });
  });
  it("indica queda e estabilidade", () => {
    expect(tithersSummary([tx("a", "2026-09-01"), tx("b", "2026-09-02")], NOW)).toMatchObject({ current: 0, previous: 2, delta: -2, trend: "down" });
    expect(tithersSummary([tx("a", "2026-10-01"), tx("a", "2026-09-01")], NOW)).toMatchObject({ delta: 0, trend: "same" });
  });
  it("em janeiro compara com dezembro do ano anterior", () => {
    const jan = new Date(2027, 0, 20);
    expect(tithersSummary([tx("a", "2027-01-05"), tx("b", "2026-12-05"), tx("c", "2026-12-06")], jan)).toMatchObject({ current: 1, previous: 2, trend: "down" });
  });
});

describe("eventos do dashboard", () => {
  it("ignora rascunhos e eventos já encerrados e ordena pelo mais próximo", () => {
    const ev = [
      { id: "longe", starts_at: "2026-12-01T10:00:00Z", ends_at: null, published: true },
      { id: "rascunho", starts_at: "2026-10-20T10:00:00Z", ends_at: null, published: false },
      { id: "perto", starts_at: "2026-10-25T10:00:00Z", ends_at: null, published: true },
      { id: "passou", starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-02T10:00:00Z", published: true },
      { id: "em-andamento", starts_at: "2026-10-17T10:00:00Z", ends_at: "2026-10-19T10:00:00Z", published: true },
    ];
    expect(upcomingEvents(ev, NOW).map((e) => e.id)).toEqual(["em-andamento", "perto", "longe"]);
  });
});

describe("metas em andamento", () => {
  const goal = (id: string, status: string, deadline: string | null, target = 1000, manual: number | null = null) =>
    ({ id, title: id, status, deadline, target_amount: target, manual_amount: manual, category: null, recurrence: "nao", start_date: null, responsible: null, created_at: "" }) as Goal;
  it("mostra só as em andamento, com progresso, as de prazo mais próximo primeiro", () => {
    const goals = [goal("sem-prazo", "em_andamento", null, 1000, 250), goal("concluida", "concluida", "2026-11-01"), goal("urgente", "em_andamento", "2026-11-01", 200, 100)];
    const res = activeGoals(goals, [], 3);
    expect(res.map((r) => r.goal.id)).toEqual(["urgente", "sem-prazo"]);
    expect(res[0]).toMatchObject({ raised: 100, target: 200, pct: 50 });
    expect(res[1]).toMatchObject({ raised: 250, pct: 25 });
  });
});
