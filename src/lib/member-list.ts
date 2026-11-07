import { MEMBER_STATUS, ageFrom } from "@/lib/church";

export const SORT_OPTIONS = [
  { value: "nome_asc", label: "Nome (A–Z)" },
  { value: "nome_desc", label: "Nome (Z–A)" },
  { value: "idade_desc", label: "Idade (maior para menor)" },
  { value: "idade_asc", label: "Idade (menor para maior)" },
  { value: "matricula_desc", label: "Matrícula (decrescente)" },
  { value: "matricula_asc", label: "Matrícula (crescente)" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

type Sortable = {
  full_name: string;
  birth_date?: string | null;
  registration_number?: string | null;
};

const byName = (a: Sortable, b: Sortable) =>
  a.full_name.localeCompare(b.full_name, "pt-BR", { sensitivity: "base" });

/** Matrícula como número (as matrículas da igreja são numéricas); nulo quando vazia ou sem dígitos. */
export function registrationNumber(m: Pick<Sortable, "registration_number">): number | null {
  const d = (m.registration_number ?? "").replace(/\D/g, "");
  return d ? Number(d) : null;
}

/** Idade em anos; mais velho primeiro = nascimento mais antigo. Nulo quando não há data de nascimento. */
function ageOf(m: Pick<Sortable, "birth_date">): number | null {
  return ageFrom(m.birth_date);
}

/**
 * Ordena sem alterar a lista original. Quem não tem o dado (idade ou matrícula) vai sempre para o fim,
 * qualquer que seja o sentido; empates desempatam pelo nome.
 */
export function sortMembers<T extends Sortable>(list: readonly T[], key: SortKey): T[] {
  const withValue = (get: (m: T) => number | null, dir: 1 | -1) => (a: T, b: T) => {
    const x = get(a);
    const y = get(b);
    if (x === null && y === null) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir || byName(a, b);
  };
  const copy = [...list];
  switch (key) {
    case "nome_asc":
      return copy.sort(byName);
    case "nome_desc":
      return copy.sort((a, b) => byName(b, a));
    case "idade_desc":
      return copy.sort(withValue(ageOf, -1));
    case "idade_asc":
      return copy.sort(withValue(ageOf, 1));
    case "matricula_desc":
      return copy.sort(withValue(registrationNumber, -1));
    case "matricula_asc":
      return copy.sort(withValue(registrationNumber, 1));
  }
}

/** Quantidade de cadastros em cada status (na ordem de MEMBER_STATUS), só os que têm pelo menos um. */
export function countByStatus(
  list: readonly { status: string }[],
): { status: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of list) counts.set(m.status, (counts.get(m.status) ?? 0) + 1);
  const known = Object.entries(MEMBER_STATUS)
    .filter(([k]) => k !== "visitante" && counts.has(k))
    .map(([k, label]) => ({ status: k, label, count: counts.get(k) ?? 0 }));
  // Status que não estejam na lista conhecida não podem sumir da conta
  const unknown = [...counts.entries()]
    .filter(([k]) => k !== "visitante" && !(k in MEMBER_STATUS))
    .map(([k, count]) => ({ status: k, label: k, count }));
  return [...known, ...unknown];
}
