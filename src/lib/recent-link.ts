/** Quantos dias um cadastro continua com a marca "Cadastro recente" depois que a conta é vinculada. */
export const RECENT_LINK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export const recentLinkSince = (now = new Date()) =>
  new Date(now.getTime() - RECENT_LINK_DAYS * DAY_MS).toISOString();

export const isRecentLink = (iso: string | null | undefined, now = new Date()) =>
  !!iso && now.getTime() - new Date(iso).getTime() <= RECENT_LINK_DAYS * DAY_MS;

/** Cadastro -> data do vínculo mais recente (uma pessoa pode ter sido desvinculada e vinculada de novo). */
export function latestLinkByMember(
  events: readonly { member_id: string | null; created_at: string }[],
) {
  const map = new Map<string, string>();
  for (const e of events) {
    if (!e.member_id) continue;
    const prev = map.get(e.member_id);
    if (!prev || e.created_at > prev) map.set(e.member_id, e.created_at);
  }
  return map;
}
