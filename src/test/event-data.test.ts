import { describe, expect, it } from "vitest";
import { religionLabel, summarizePeople } from "@/lib/event-data";

const ages: Record<string, number> = { a: 20, b: 30, c: 40, d: 17 };
const ageOf = (b?: string | null) => (b ? (ages[b] ?? null) : null);

describe("summarizePeople", () => {
  const people = [
    {
      attendee_birth_date: "a",
      attendee_religion: "evangelico",
      attendee_institution: "Igreja Aava",
    },
    {
      attendee_birth_date: "b",
      attendee_religion: "evangelico",
      attendee_institution: " igreja aava ",
    },
    {
      attendee_birth_date: "c",
      attendee_religion: "catolico",
      attendee_institution: "Escola Árvore",
    },
    { attendee_birth_date: "d", attendee_religion: null, attendee_institution: null },
    { attendee_birth_date: null, attendee_religion: "outros", attendee_institution: "" },
  ];
  const s = summarizePeople(people, ageOf);

  it("calcula média, mediana e extremos só com quem tem data", () => {
    expect(s.ageStats).toEqual({ count: 4, avg: 26.8, median: 25, min: 17, max: 40 });
  });
  it("distribui por faixa etária", () => {
    expect(s.bands.find((b) => b.label === "13–17")?.count).toBe(1);
    expect(s.bands.find((b) => b.label === "18–24")?.count).toBe(1);
    expect(s.bands.find((b) => b.label === "25–34")?.count).toBe(1);
    expect(s.bands.find((b) => b.label === "35–44")?.count).toBe(1);
  });
  it("conta religiões com percentual sobre o total e 'Não informado'", () => {
    const get = (v: string) => s.religions.find((r) => r.value === v);
    expect(get("evangelico")).toMatchObject({ count: 2, pct: 40 });
    expect(get("catolico")?.count).toBe(1);
    expect(get("espirita")?.count).toBe(0);
    expect(get("")).toMatchObject({ label: "Não informado", count: 1, pct: 20 });
  });
  it("agrupa instituições ignorando maiúsculas, acentos e espaços", () => {
    expect(s.institutions[0]).toEqual({ name: "Igreja Aava", count: 2 });
    expect(s.institutions).toHaveLength(2);
  });
  it("lida com lista vazia", () => {
    const e = summarizePeople([], ageOf);
    expect(e.ageStats.avg).toBeNull();
    expect(e.religions).toEqual([]);
  });
  it("rotula religiões", () => {
    expect(religionLabel("matriz_africana")).toBe("Matriz africana");
    expect(religionLabel(null)).toBe("Não informado");
  });
});
