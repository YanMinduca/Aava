import { ageFrom } from "@/lib/church";

export const RELIGIONS = [
  { value: "evangelico", label: "Evangélico" },
  { value: "catolico", label: "Católico" },
  { value: "espirita", label: "Espírita" },
  { value: "matriz_africana", label: "Matriz africana" },
  { value: "outros", label: "Outros" },
] as const;

/** Membros não respondem o questionário: a inscrição fica registrada como "Membro da igreja". */
export const MEMBER_RELIGION = { value: "membro_igreja", label: "Membro da igreja" } as const;

export function religionLabel(v?: string | null) {
  if (!v) return "Não informado";
  if (v === MEMBER_RELIGION.value) return MEMBER_RELIGION.label;
  return RELIGIONS.find((r) => r.value === v)?.label ?? v;
}

export const AGE_BANDS = [
  { label: "0–12", min: 0, max: 12 },
  { label: "13–17", min: 13, max: 17 },
  { label: "18–24", min: 18, max: 24 },
  { label: "25–34", min: 25, max: 34 },
  { label: "35–44", min: 35, max: 44 },
  { label: "45–59", min: 45, max: 59 },
  { label: "60+", min: 60, max: 200 },
] as const;

export type Person = {
  /** Inscrição de filho(a): idade informada pelo responsável e sem religião/instituição. */
  is_child?: boolean | null;
  child_age?: number | null;
  attendee_birth_date?: string | null;
  attendee_religion?: string | null;
  attendee_institution?: string | null;
};

/** Idade da inscrição: a informada pelo responsável (filho/a) ou a calculada pela data de nascimento. */
export function registrationAge(r: Person): number | null {
  return r.is_child ? (r.child_age ?? null) : ageFrom(r.attendee_birth_date);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Números da aba "Dados": médias de idade, distribuição de religiões e instituições. */
export function summarizePeople(
  people: Person[],
  ageOf: (b?: string | null) => number | null = ageFrom,
) {
  const total = people.length;
  // Religião e instituição são perguntas feitas ao adulto: crianças ficam fora dessas contagens.
  const adults = people.filter((p) => !p.is_child);
  const children = total - adults.length;
  const ages = people
    .map((p) => (p.is_child ? (p.child_age ?? null) : ageOf(p.attendee_birth_date)))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const ageStats = {
    count: ages.length,
    avg: ages.length ? round1(ages.reduce((s, a) => s + a, 0) / ages.length) : null,
    median: ages.length
      ? ages.length % 2
        ? ages[mid]!
        : round1((ages[mid - 1]! + ages[mid]!) / 2)
      : null,
    min: ages.length ? ages[0] : null,
    max: ages.length ? ages[ages.length - 1] : null,
  };
  const bands = AGE_BANDS.map((b) => ({
    label: b.label,
    count: ages.filter((a) => a >= b.min && a <= b.max).length,
  }));

  const rel = new Map<string, number>();
  for (const p of adults)
    rel.set(p.attendee_religion ?? "", (rel.get(p.attendee_religion ?? "") ?? 0) + 1);
  const religions = [...RELIGIONS.map((r) => r.value as string), MEMBER_RELIGION.value, ""]
    .map((value) => ({ value, label: religionLabel(value || null), count: rel.get(value) ?? 0 }))
    .filter(
      (r) =>
        r.count > 0 ||
        (r.value !== "" && r.value !== MEMBER_RELIGION.value && adults.length > 0),
    )
    .map((r) => ({ ...r, pct: adults.length ? round1((r.count / adults.length) * 100) : 0 }));

  const inst = new Map<string, { name: string; count: number }>();
  for (const p of adults) {
    const name = (p.attendee_institution ?? "").trim();
    if (!name) continue;
    const k = norm(name);
    const cur = inst.get(k);
    if (cur) cur.count++;
    else inst.set(k, { name, count: 1 });
  }
  const institutions = [...inst.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"),
  );

  return { total, children, ageStats, bands, religions, institutions };
}
