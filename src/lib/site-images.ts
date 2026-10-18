import { supabase } from "@/integrations/supabase/client";
import { SITE_BUCKET, compressImage, fileExt } from "@/lib/images";

/** Compacta a imagem e envia para o armazenamento (bucket público do site). Devolve a URL pública. */
export async function uploadSiteImage(file: File, kind: "photos" | "pix"): Promise<{ url: string; path: string }> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) throw new Error("Escolha uma imagem de até 15 MB.");
  // QR code precisa ficar nítido: PNG menor; fotos viram JPEG leve.
  const blob =
    kind === "pix"
      ? await compressImage(file, { maxSide: 900, type: "image/png" })
      : await compressImage(file, { maxSide: 1600, quality: 0.82 });
  const path = `${kind}/${crypto.randomUUID()}.${fileExt(blob, file.name)}`;
  const { error } = await supabase.storage.from(SITE_BUCKET).upload(path, blob, { contentType: blob.type || file.type, cacheControl: "31536000" });
  if (error) throw new Error("Não foi possível enviar a imagem. Use JPG, PNG ou WebP de até 5 MB.");
  return { url: supabase.storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl, path };
}

/** Apaga arquivos que deixaram de ser usados (falhas são ignoradas: o site continua funcionando). */
export async function removeSiteImages(paths: string[]) {
  if (paths.length) await supabase.storage.from(SITE_BUCKET).remove(paths);
}
