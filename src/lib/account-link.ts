const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type AccountLike = { name: string | null; email: string | null };
type MemberLike = { full_name: string; email: string | null; phone?: string | null };

/**
 * Cadastros que ainda não têm conta, para escolher a quem ligar uma conta.
 * Os que parecem ser da mesma pessoa (mesmo e-mail ou mesmo nome) vêm primeiro e ficam marcados como sugestão.
 * `query` filtra por nome, e-mail ou telefone.
 */
export function rankMembersForAccount<T extends MemberLike>(account: AccountLike, members: readonly T[], query = ""): Array<T & { suggested: boolean }> {
  const q = norm(query);
  const accountEmail = norm(account.email);
  const accountName = norm(account.name);
  return members
    .filter((m) => !q || norm(m.full_name).includes(q) || norm(m.email).includes(q) || norm(m.phone).includes(q))
    .map((m) => ({
      ...m,
      suggested: (!!accountEmail && norm(m.email) === accountEmail) || (!!accountName && norm(m.full_name) === accountName),
    }))
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.full_name.localeCompare(b.full_name, "pt-BR"));
}
