import { describe, expect, it } from 'vitest';
import { hasFullAccess, canAssignPresident, inviteIsValid, instagramEmbed } from '@/lib/access-rules';
describe('Community rules', () => {
  it('gives the president pastor CEO-equivalent access', () => {
    expect(hasFullAccess(['pastor_presidente'])).toBe(true);
    expect(hasFullAccess(['ceo'])).toBe(true);
    expect(hasFullAccess(['admin'])).toBe(false);
  });
  it('only CEO assigns the president pastor', () => {
    expect(canAssignPresident(['ceo'])).toBe(true);
    expect(canAssignPresident(['pastor_presidente'])).toBe(false);
    expect(canAssignPresident(['admin'])).toBe(false);
  });
  it('keeps unlimited invitations valid after repeated use', () => {
    const i = { unlimited: true, used_at: '2026-01-01', expires_at: '2026-01-02' };
    expect(inviteIsValid(i, new Date('2026-10-07'))).toBe(true);
    expect(inviteIsValid({ ...i, unlimited: false }, new Date('2026-10-07'))).toBe(false);
  });
  it('only embeds Instagram posts or reels', () => {
    expect(instagramEmbed('https://www.instagram.com/reel/ABC123/')).toBe('https://www.instagram.com/reel/ABC123/embed/');
    expect(instagramEmbed('https://example.com/reel/ABC123/')).toBeNull();
  });
});