/**
 * Limite do reenvio do e-mail de confirmação: no máximo 3 reenvios, com 1 minuto entre um envio e o seguinte.
 * A contagem (por e-mail) fica guardada no navegador e zera 24 h depois do primeiro envio.
 * Obs.: este controle é da própria tela; o Supabase também impõe os seus limites de envio de e-mail.
 */
export const RESEND_MAX = 3;
export const RESEND_INTERVAL_MS = 60_000;
export const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ResendStore = Pick<Storage, "getItem" | "setItem">;
type Entry = { count: number; first: number; last: number };
export type ResendStatus = { canResend: boolean; remaining: number; waitMs: number; reason: "ok" | "wait" | "limit" };

const key = (email: string) => `aava:resend:${email.trim().toLowerCase()}`;

const memory = new Map<string, string>();
const memoryStore: ResendStore = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
export function defaultStore(): ResendStore {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // navegador com armazenamento bloqueado
  }
  return memoryStore;
}

function read(email: string, now: number, store: ResendStore): Entry | null {
  try {
    const raw = store.getItem(key(email));
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    if (typeof e.count !== "number" || typeof e.first !== "number" || typeof e.last !== "number") return null;
    return now - e.first > RESEND_WINDOW_MS ? null : e;
  } catch {
    return null;
  }
}

export function resendStatus(email: string, now = Date.now(), store: ResendStore = defaultStore()): ResendStatus {
  const e = read(email, now, store);
  const remaining = Math.max(0, RESEND_MAX - (e?.count ?? 0));
  if (remaining === 0) return { canResend: false, remaining: 0, waitMs: e ? Math.max(0, e.first + RESEND_WINDOW_MS - now) : 0, reason: "limit" };
  const waitMs = e ? Math.max(0, e.last + RESEND_INTERVAL_MS - now) : 0;
  return { canResend: waitMs === 0, remaining, waitMs, reason: waitMs > 0 ? "wait" : "ok" };
}

/** Anota um envio. `resend: false` é o e-mail enviado ao criar a conta (conta o intervalo, mas não o limite). */
export function recordSend(email: string, { resend }: { resend: boolean }, now = Date.now(), store: ResendStore = defaultStore()) {
  const e = read(email, now, store) ?? { count: 0, first: now, last: now };
  store.setItem(key(email), JSON.stringify({ count: e.count + (resend ? 1 : 0), first: e.first, last: now }));
}
