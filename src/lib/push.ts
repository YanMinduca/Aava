import { supabase } from "@/integrations/supabase/client";
import { isIos, isStandalone } from "@/lib/pwa";

/** Situação das notificações push neste aparelho. */
export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const OPT_OUT_KEY = "aava-push-off";

const inBrowser = () => typeof window !== "undefined" && typeof navigator !== "undefined";

export const pushSupported = () =>
  inBrowser() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function flag(name: string, value?: boolean): boolean {
  try {
    if (value === true) localStorage.setItem(name, "1");
    else if (value === false) localStorage.removeItem(name);
    return localStorage.getItem(name) === "1";
  } catch {
    return false;
  }
}
/** A pessoa desligou as notificações de propósito neste aparelho (não reativar sozinho nem insistir). */
export const pushOptedOut = () => flag(OPT_OUT_KEY);

export function urlBase64ToBytes(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

async function registerWorker() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function fetchPublicKey(): Promise<Uint8Array> {
  const { data, error } = await supabase.functions.invoke<{ publicKey?: string }>("push", { body: { action: "public_key" } });
  if (error || !data?.publicKey) throw new Error("push_key_unavailable");
  return urlBase64ToBytes(data.publicKey);
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc("save_push_subscription", {
    _endpoint: json.endpoint ?? sub.endpoint,
    _p256dh: json.keys?.["p256dh"] ?? "",
    _auth: json.keys?.["auth"] ?? "",
    _user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Pede permissão, assina o push neste aparelho e registra no banco para a pessoa logada. */
export async function enablePush() {
  if (!pushSupported()) throw new Error("push_unsupported");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "push_denied" : "push_dismissed");
  const reg = await registerWorker();
  const key = await fetchPublicKey();
  let sub = await reg.pushManager.getSubscription();
  // Se as chaves do servidor mudaram, a assinatura antiga não serve mais.
  if (sub && !sameBytes(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  await saveSubscription(sub);
  flag(OPT_OUT_KEY, false);
}

/** Desliga neste aparelho: remove do banco e cancela a assinatura do navegador. */
export async function disablePush() {
  flag(OPT_OUT_KEY, true);
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("delete_push_subscription", { _endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/**
 * Ao abrir o painel: se este aparelho já tem permissão, renova o registro (e passa a assinatura para a pessoa
 * que está logada agora). Não pede permissão e respeita quem desligou.
 */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted" || pushOptedOut()) return;
  await enablePush();
}

/** Ao sair da conta: este aparelho deixa de receber os avisos dessa pessoa (a permissão do navegador continua). */
export async function forgetPushDevice() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await supabase.rpc("delete_push_subscription", { _endpoint: sub.endpoint });
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke<{ devices: number; sent: number }>("push", { body: { action: "test" } });
  if (error) throw error;
  return data ?? { devices: 0, sent: 0 };
}

export function pushErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "push_denied") return "As notificações estão bloqueadas neste navegador. Libere nas configurações do site e tente de novo.";
  if (m === "push_dismissed") return "Você fechou o pedido de permissão. Toque em “Ativar” de novo e escolha “Permitir”.";
  if (m === "push_unsupported") return "Este navegador não permite notificações push.";
  if (m === "push_key_unavailable") return "Não foi possível falar com o servidor de notificações agora. Tente de novo em instantes.";
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}
