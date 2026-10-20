import { supabase } from "@/integrations/supabase/client";

/**
 * URLs assinadas das fotos de membros, em lote e com cache.
 *
 * Antes cada avatar pedia a sua própria URL ao banco (uma chamada por foto, a cada abertura de tela)
 * e a URL mudava toda vez, então o navegador nunca reaproveitava a imagem já baixada.
 * Agora: um único pedido para várias fotos, a mesma URL é reaproveitada (memória + sessionStorage)
 * e o navegador consegue usar o cache dele.
 */

const BUCKET = "member-photos";
const TTL_SECONDS = 12 * 60 * 60; // validade da URL assinada
const RENEW_BEFORE_MS = 60 * 60 * 1000; // renova 1 h antes de vencer
const BATCH_DELAY_MS = 15; // espera um instante para juntar os avatares da mesma tela
const BATCH_SIZE = 100;
const STORE_KEY = "aava:photo-urls:v1";

type Entry = { url: string; exp: number };

const cache = new Map<string, Entry>();
const waiting = new Map<string, Array<(url: string | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let loadedFromStore = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function loadFromStore() {
  if (loadedFromStore) return;
  loadedFromStore = true;
  try {
    const raw = storage()?.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    for (const [path, e] of Object.entries(parsed)) if (e?.url && isFresh(e)) cache.set(path, e);
  } catch {
    // cache corrompido: ignora
  }
}

function saveToStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const out: Record<string, Entry> = {};
      for (const [path, e] of cache) if (isFresh(e)) out[path] = e;
      storage()?.setItem(STORE_KEY, JSON.stringify(out));
    } catch {
      // sessionStorage cheio/indisponível: segue só com a memória
    }
  }, 300);
}

const isFresh = (e: Entry) => e.exp - Date.now() > RENEW_BEFORE_MS;

/** URL já conhecida (sem rede), para o avatar não "piscar" ao voltar numa tela. */
export function peekPhotoUrl(path?: string | null): string | null {
  if (!path) return null;
  loadFromStore();
  const e = cache.get(path);
  return e && isFresh(e) ? e.url : null;
}

async function flush() {
  timer = null;
  const paths = [...waiting.keys()];
  const callbacks = new Map(waiting);
  waiting.clear();

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const chunk = paths.slice(i, i + BATCH_SIZE);
    const result = new Map<string, string>();
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(chunk, TTL_SECONDS);
      for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) result.set(row.path, row.signedUrl);
    } catch {
      // sem rede: os avatares ficam com o ícone padrão
    }
    const exp = Date.now() + TTL_SECONDS * 1000;
    for (const path of chunk) {
      const url = result.get(path) ?? null;
      if (url) cache.set(path, { url, exp });
      for (const cb of callbacks.get(path) ?? []) cb(url);
    }
  }
  saveToStore();
}

/** Pede a URL de uma foto; vários pedidos feitos juntos viram uma única chamada ao banco. */
export function getPhotoUrl(path: string): Promise<string | null> {
  const known = peekPhotoUrl(path);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    waiting.set(path, [...(waiting.get(path) ?? []), resolve]);
    if (!timer) timer = setTimeout(() => void flush(), BATCH_DELAY_MS);
  });
}

/** Esquece as URLs guardadas (use depois de trocar o conteúdo de fotos existentes). */
export function clearPhotoUrlCache() {
  cache.clear();
  try {
    storage()?.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
