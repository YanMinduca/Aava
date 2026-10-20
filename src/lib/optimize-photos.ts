import { supabase } from "@/integrations/supabase/client";
import { compressImage, MEMBER_PHOTO_MAX_SIDE } from "@/lib/images";
import { clearPhotoUrlCache } from "@/lib/photo-urls";

const BUCKET = "member-photos";
/** Fotos até este tamanho já estão leves e não são mexidas. */
export const SKIP_BELOW_BYTES = 50 * 1024;

export type OptimizeResult = {
  total: number;
  optimized: number;
  skipped: number;
  failed: number;
  savedBytes: number;
};

/**
 * Reduz as fotos de membros que já estão no armazenamento (antes eram salvas com até 900 px).
 * A foto é regravada NO MESMO caminho, então nada muda no cadastro nem na limpeza automática de arquivos.
 * É seguro rodar mais de uma vez: fotos já leves são ignoradas. A redução não pode ser desfeita.
 */
export async function optimizeMemberPhotos(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
  concurrency = 4,
): Promise<OptimizeResult> {
  const unique = [...new Set(paths.filter(Boolean))];
  const result: OptimizeResult = { total: unique.length, optimized: 0, skipped: 0, failed: 0, savedBytes: 0 };
  let next = 0;
  let done = 0;

  async function one(path: string) {
    try {
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !blob) throw error ?? new Error("sem arquivo");
      if (blob.size <= SKIP_BELOW_BYTES || !blob.type.startsWith("image/")) {
        result.skipped++;
        return;
      }
      const source = new File([blob], path.split("/").pop() ?? "foto", { type: blob.type });
      const small = await compressImage(source, { maxSide: MEMBER_PHOTO_MAX_SIDE, quality: 0.8 });
      // Só regrava se ficou de fato menor (compressImage devolve o original quando não consegue reduzir).
      if (small === source || small.size >= blob.size * 0.9) {
        result.skipped++;
        return;
      }
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, small, { upsert: true, contentType: small.type || blob.type, cacheControl: "86400" });
      if (upError) throw upError;
      result.optimized++;
      result.savedBytes += blob.size - small.size;
    } catch {
      result.failed++;
    } finally {
      done++;
      onProgress?.(done, unique.length);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
      while (next < unique.length) await one(unique[next++]!);
    }),
  );
  if (result.optimized > 0) clearPhotoUrlCache();
  return result;
}
