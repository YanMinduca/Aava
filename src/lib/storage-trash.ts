import { supabase } from "@/integrations/supabase/client";

let running: Promise<number> | null = null;

async function stillExists(bucket: string, path: string) {
  const i = path.lastIndexOf("/");
  const dir = i === -1 ? "" : path.slice(0, i);
  const name = i === -1 ? path : path.slice(i + 1);
  const { data } = await supabase.storage.from(bucket).list(dir, { limit: 5, search: name });
  return !!data?.some((o) => o.name === name);
}

/**
 * Apaga de verdade os arquivos que o banco colocou na "lixeira" (linhas apagadas ou trocadas: comprovantes,
 * fotos, QR de Pix...). O SQL não pode apagar arquivos do armazenamento, então é este passo que conclui.
 * Um arquivo só sai da lixeira quando foi apagado (ou já não existe mais); se algo falhar, tenta de novo depois.
 * Devolve quantos arquivos foram tirados da lixeira.
 */
export function purgeStorageTrash(): Promise<number> {
  if (running) return running;
  running = (async () => {
    let total = 0;
    try {
      for (let round = 0; round < 5; round++) {
        const { data, error } = await supabase.rpc("storage_trash_next", { _limit: 100 });
        if (error || !data || data.length === 0) break;

        const byBucket = new Map<string, { id: number; path: string }[]>();
        for (const row of data) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), { id: row.id, path: row.path }]);

        const done: number[] = [];
        for (const [bucket, items] of byBucket) {
          const { data: removed, error: rmError } = await supabase.storage.from(bucket).remove(items.map((i) => i.path));
          if (rmError) continue;
          const gone = new Set((removed ?? []).map((o) => o.name));
          for (const item of items) {
            if (gone.has(item.path) || !(await stillExists(bucket, item.path))) done.push(item.id);
          }
        }
        if (done.length === 0) break;
        await supabase.rpc("storage_trash_done", { _ids: done });
        total += done.length;
        if (data.length < 100) break;
      }
    } catch {
      // Falha de rede: o que ficou na lixeira é tentado de novo na próxima vez.
    } finally {
      running = null;
    }
    return total;
  })();
  return running;
}
