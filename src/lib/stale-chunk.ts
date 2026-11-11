/**
 * Versão antiga do site aberta no navegador.
 *
 * A cada deploy os arquivos do site mudam de nome e os antigos saem do servidor. Quem estava com o site aberto
 * (ou com a página antiga guardada no navegador) pede um arquivo que não existe mais (404) e vê
 * "Esta página não carregou". Aqui detectamos esse caso e recarregamos o site sozinho, uma única vez,
 * para pegar a versão nova.
 */

const KEY = "aava:stale-chunk-reload";
/** Se já recarregamos há menos que isso e o erro voltou, não recarrega de novo (evita laço infinito). */
const COOLDOWN_MS = 60_000;

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk [\w-]+ failed|ChunkLoadError/i;

/** O erro é de arquivo do site que não carregou (versão antiga), e não um defeito de uma tela? */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  const text = `${typeof e.name === "string" ? e.name : ""} ${typeof e.message === "string" ? e.message : String(error)}`;
  return CHUNK_ERROR.test(text);
}

function read(): number {
  try {
    return Number(window.sessionStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Já recarregamos há pouco por causa disso? */
export function recentlyReloaded(now = Date.now()): boolean {
  return now - read() < COOLDOWN_MS;
}

/** Recarrega o site uma vez. Devolve true se mandou recarregar, false se já tinha recarregado há pouco. */
export function reloadForNewVersion(now = Date.now()): boolean {
  if (typeof window === "undefined" || recentlyReloaded(now)) return false;
  try {
    window.sessionStorage.setItem(KEY, String(now));
  } catch {
    /* sem sessionStorage: segue mesmo assim; no pior caso o botão "Atualizar" resolve */
  }
  window.location.reload();
  return true;
}

/** O Vite avisa (vite:preloadError) quando um arquivo da próxima tela não carrega: recarregamos antes de dar erro. */
export function installStaleChunkGuard(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}
