export const hasFullAccess = (roles: readonly string[]) => roles.includes('ceo') || roles.includes('pastor_presidente');
export const canAssignPresident = (roles: readonly string[]) => roles.includes('ceo');
export function inviteIsValid(invite: { unlimited: boolean; used_at: string | null; expires_at: string }, now = new Date()) {
  return invite.unlimited || (!invite.used_at && new Date(invite.expires_at) > now);
}
export function instagramEmbed(url: string) {
  try {
    const u = new URL(url);
    if (!['instagram.com', 'www.instagram.com'].includes(u.hostname)) return null;
    const match = u.pathname.match(/^\/(reel|p|tv)\/([A-Za-z0-9_-]+)\/?$/);
    return match ? `https://www.instagram.com/${match[1]}/${match[2]}/embed/` : null;
  } catch { return null; }
}