/** Mídia de divulgação do evento: foto, vídeo (arquivo) ou post do Instagram (link). Sem dependência do Supabase (testável). */

export const EVENT_MEDIA_BUCKET = "event-media";

export type EventMediaType = "image" | "video" | "instagram";

export type EventMedia =
  | { type: "image" | "video"; path: string; url: null }
  | { type: "instagram"; path: null; url: string };

/** Campos de mídia como vêm do banco (tabela events e RPCs públicas). */
export type EventMediaFields = {
  media_type?: string | null;
  media_path?: string | null;
  media_url?: string | null;
};

/** Vídeo: até 50 MB (limite do bucket). Foto: reduzida no navegador antes do envio. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Devolve a mídia só quando os campos estão coerentes; qualquer coisa estranha vira "sem mídia". */
export function eventMediaFrom(e: EventMediaFields | null | undefined): EventMedia | null {
  if (!e?.media_type) return null;
  if ((e.media_type === "image" || e.media_type === "video") && e.media_path) {
    return { type: e.media_type, path: e.media_path, url: null };
  }
  if (e.media_type === "instagram" && e.media_url && parseInstagramUrl(e.media_url)) {
    return { type: "instagram", path: null, url: e.media_url };
  }
  return null;
}

export type InstagramPost = { kind: "p" | "reel" | "tv"; code: string; canonical: string };

const IG_RE =
  /^https:\/\/(?:www\\.)?instagram\\.com\\/(?:[A-Za-z0-9._]+\\/)?(p|reel|reels|tv)\\/([A-Za-z0-9_-]{5,})\\/?(?:[?#].*)?$/;

/**
 * Lê o link de um post, reel ou IGTV do Instagram. Só aceita https://instagram.com (com ou sem www).
 * O iframe do site é sempre montado a partir do código extraído, nunca com o texto digitado.
 */
export function parseInstagramUrl(input: string | null | undefined): InstagramPost | null {
  const m = IG_RE.exec((input ?? "").trim());
  if (!m) return null;
  const kind = m[1] === "reels" ? "reel" : (m[1] as "p" | "reel" | "tv");
  const code = m[2]!;
  return { kind, code, canonical: `https://www.instagram.com/${kind}/${code}/` };
}

/**
 * O parâmetro oficial hidecaption=true solicita ao Instagram que omita a legenda no embed.
 * Ele não garante a remoção de CTAs/elementos de interface que o Instagram injeta no iframe.
 */
export const instagramEmbedUrl = (post: InstagramPost) =>
  `${post.canonical}embed/?hidecaption=true`;

/** Confere o arquivo escolhido para o evento; devolve a mensagem de erro ou null. */
export function checkMediaFile(type: "image" | "video", file: File): string | null {
  if (type === "image") {
    if (!file.type.startsWith("image/")) return "Escolha um arquivo de imagem (JPG, PNG ou WebP).";
    if (file.size > MAX_IMAGE_BYTES) return "A foto deve ter até 15 MB.";
    return null;
  }
  if (!VIDEO_TYPES.includes(file.type)) return "Envie o vídeo em MP4 ou WebM.";
  if (file.size > MAX_VIDEO_BYTES) return "O vídeo deve ter até 50 MB.";
  return null;
}

/** Extensão do arquivo de mídia a partir do tipo (o nome original do arquivo não é usado no caminho). */
export function mediaExt(type: "image" | "video", blob: Blob): string {
  if (type === "image")
    return blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  return blob.type === "video/webm" ? "webm" : blob.type === "video/quicktime" ? "mov" : "mp4";
}
