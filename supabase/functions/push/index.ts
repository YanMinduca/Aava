// Função de borda "push": envia notificações push (Web Push + VAPID) para os aparelhos cadastrados.
//
// Ações (POST com JSON { action, ... }):
//   public_key  -> devolve a chave pública VAPID (a função gera o par de chaves na primeira vez)
//   test        -> (logado) manda uma notificação de teste só para quem pediu
//   send        -> (logado, permissão "send_push") envia um aviso manual para um público
//   dispatch    -> (banco de dados, cabeçalho x-push-secret) avisos automáticos dos gatilhos do banco
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Config = { public_key: string; private_key: string; subject: string; webhook_secret: string };
type Audience = Record<string, unknown> & { type: string };
type Notice = { audience: Audience; title: string; body: string; url: string; tag?: string | null; kind: "manual" | "auto" | "test"; createdBy?: string };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

let cached: Config | null = null;
async function loadConfig(): Promise<Config> {
  if (cached) return cached;
  let { data } = await admin.from("push_config").select("*").eq("id", true).single();
  if (!data) throw new Error("push_config ausente");
  if (!data.public_key || !data.private_key) {
    const keys = webpush.generateVAPIDKeys();
    // Só grava se ainda estiver vazio (duas chamadas ao mesmo tempo não geram chaves diferentes).
    await admin.from("push_config").update({ public_key: keys.publicKey, private_key: keys.privateKey }).eq("id", true).is("public_key", null);
    ({ data } = await admin.from("push_config").select("*").eq("id", true).single());
  }
  cached = data as Config;
  return cached;
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// O link do aviso só pode apontar para uma página do próprio site.
const cleanUrl = (u: unknown) => (typeof u === "string" && u.startsWith("/") && !u.startsWith("//") ? u.slice(0, 300) : "/painel");

export async function deliver(cfg: Config, n: Notice) {
  webpush.setVapidDetails(cfg.subject, cfg.public_key, cfg.private_key);

  const { data: users } = await admin.rpc("push_audience_users", { _aud: n.audience });
  const ids = [...new Set(((users ?? []) as { user_id: string }[]).map((u) => u.user_id))];

  const subs: { id: string; endpoint: string; p256dh: string; auth: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids.slice(i, i + 200));
    subs.push(...(data ?? []));
  }

  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag ?? undefined });
  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < subs.length) {
      const s = subs[next++]!;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "normal" });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // aparelho não existe mais
        else console.error("push falhou", code, (e as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  const result = { recipients: ids.length, devices: subs.length, sent, failed };
  if (n.kind !== "test") {
    await admin.from("push_notifications").insert({
      kind: n.kind, title: n.title, body: n.body, url: n.url, audience: n.audience,
      created_by: n.createdBy ?? null, ...result,
    });
  }
  return result;
}

async function userFrom(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

function parseAudience(a: unknown): Audience | null {
  const x = a as { type?: string; id?: string } | null;
  if (!x || typeof x.type !== "string") return null;
  if (["all", "members", "leadership"].includes(x.type)) return { type: x.type };
  if (x.type === "department" && typeof x.id === "string" && /^[0-9a-f-]{36}$/i.test(x.id)) return { type: "department", id: x.id };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await loadConfig();

    if (body.action === "public_key") return json({ publicKey: cfg.public_key });

    if (body.action === "dispatch") {
      if (!safeEqual(req.headers.get("x-push-secret") ?? "", cfg.webhook_secret)) return json({ error: "forbidden" }, 403);
      const audience = body.audience as Audience;
      if (!audience?.type) return json({ error: "invalid_audience" }, 400);
      return json(await deliver(cfg, {
        audience, kind: "auto", tag: body.tag,
        title: String(body.title ?? "").slice(0, 80) || "Comunidade Aava",
        body: String(body.body ?? "").slice(0, 240),
        url: cleanUrl(body.url),
      }));
    }

    const user = await userFrom(req);
    if (!user) return json({ error: "login_required" }, 401);

    if (body.action === "test") {
      return json(await deliver(cfg, {
        audience: { type: "user", id: user.id }, kind: "test", url: "/painel",
        title: "Notificações ativadas", body: "Tudo certo! Você vai receber os avisos da Aava neste aparelho.",
      }));
    }

    if (body.action === "send") {
      const { data: allowed } = await admin.rpc("has_permission", { _user_id: user.id, _permission: "send_push" });
      if (!allowed) return json({ error: "forbidden" }, 403);
      const title = String(body.title ?? "").trim().slice(0, 80);
      const text = String(body.body ?? "").trim().slice(0, 240);
      const audience = parseAudience(body.audience);
      if (!title || !audience) return json({ error: "invalid_notice" }, 400);
      // Freio contra envio em excesso: no máximo 10 avisos manuais por hora por pessoa.
      const { count } = await admin.from("push_notifications").select("id", { count: "exact", head: true })
        .eq("created_by", user.id).eq("kind", "manual").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= 10) return json({ error: "rate_limited" }, 429);
      return json(await deliver(cfg, { audience, kind: "manual", createdBy: user.id, title, body: text, url: cleanUrl(body.url) }));
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "internal" }, 500);
  }
});
