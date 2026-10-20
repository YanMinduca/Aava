/** Utilitários de imagem sem dependência do Supabase (testáveis). */

/** Lado maior das fotos de membros (elas só aparecem em círculos de até 80 px). */
export const MEMBER_PHOTO_MAX_SIDE = 400;

export type CompressOptions = { maxSide: number; quality?: number; type?: "image/jpeg" | "image/png" };

/**
 * Reduz a imagem antes do envio (menos espaço no armazenamento). PDFs e arquivos que não são imagem seguem como estão.
 * Se o navegador não conseguir ler a imagem, devolve o arquivo original.
 */
export async function compressImage(file: File, { maxSide, quality = 0.82, type = "image/jpeg" }: CompressOptions): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    if (type === "image/jpeg") {
      ctx.fillStyle = "#ffffff"; // JPEG não tem transparência
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (!blob) return file;
    return blob.size < file.size || scale < 1 ? blob : file;
  } catch {
    return file;
  }
}

/** Extensão de arquivo coerente com o conteúdo enviado. */
export function fileExt(blob: Blob, originalName = ""): string {
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "application/pdf") return "pdf";
  const fromName = originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromName && fromName.length <= 5 ? fromName : "bin";
}

export const SITE_BUCKET = "site-assets";
const SITE_PUBLIC_MARKER = `/storage/v1/object/public/${SITE_BUCKET}/`;

/** Caminho dentro do bucket a partir da URL pública (ou null se a URL não for do bucket do site). */
export function siteAssetPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(SITE_PUBLIC_MARKER);
  return i === -1 ? null : decodeURIComponent(url.slice(i + SITE_PUBLIC_MARKER.length).split("?")[0] ?? "");
}

/** Todos os arquivos do bucket usados por um conteúdo do site (fotos e QR do Pix). */
export function siteAssetPaths(content: { photos: { url: string }[]; pixKeys: { qrCode?: string | undefined }[] }): string[] {
  const all = [...content.photos.map((p) => p.url), ...content.pixKeys.map((k) => k.qrCode)];
  return all.map(siteAssetPath).filter((p): p is string => !!p);
}

/** "K7M29QXA" -> "K7M2-9QXA" (código curto do ingresso, para digitar quando a câmera não lê). */
export function formatShortCode(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase();
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
