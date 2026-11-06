/** Quem tem status "visitante" fica separado dos membros (página própria, contagem própria). */
export const VISITOR_STATUS = "visitante";

export const isVisitor = (m: { status: string }) => m.status === VISITOR_STATUS;

/** Separa a lista em membros e visitantes, mantendo a ordem de entrada. */
export function splitVisitors<T extends { status: string }>(list: readonly T[]): { members: T[]; visitors: T[] } {
  const members: T[] = [];
  const visitors: T[] = [];
  for (const m of list) (isVisitor(m) ? visitors : members).push(m);
  return { members, visitors };
}

type SignupInfo = { signup_source?: string | null; signup_event_title?: string | null };

/** Texto "de onde veio" o cadastro, para mostrar na tela. */
export function signupOrigin(m: SignupInfo): string {
  switch (m.signup_source) {
    case "event":
      return m.signup_event_title ? `Veio pelo evento: ${m.signup_event_title}` : "Veio por um evento";
    case "admin":
      return "Cadastrado pela equipe";
    case "site":
      return "Cadastro feito no site";
    default:
      return "Origem não registrada";
  }
}

/** Valor usado no filtro por origem: event:<título>, admin, site ou none. */
export function originKey(m: SignupInfo): string {
  if (m.signup_source === "event") return `event:${m.signup_event_title ?? ""}`;
  if (m.signup_source === "admin" || m.signup_source === "site") return m.signup_source;
  return "none";
}

/** Nome mostrado no seletor de origem. */
export function originKeyLabel(key: string): string {
  if (key.startsWith("event:")) return key.length > 6 ? `Evento: ${key.slice(6)}` : "Evento (sem título)";
  if (key === "admin") return "Cadastrado pela equipe";
  if (key === "site") return "Cadastro feito no site";
  return "Origem não registrada";
}

/** Quantos cadastros foram criados nos últimos `days` dias. */
export function recentCount(list: readonly { created_at: string }[], days = 30, now = new Date()): number {
  const since = now.getTime() - days * 86_400_000;
  return list.filter((m) => new Date(m.created_at).getTime() >= since).length;
}
