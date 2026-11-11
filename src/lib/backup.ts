import { supabase } from "@/integrations/supabase/client";

/** Backup completo feito pelo navegador: todas as tabelas em JSON + fotos e arquivos, tudo num ZIP. */

export type BackupProgress = {
  phase: "tabelas" | "arquivos" | "compactando" | "pronto";
  done: number;
  total: number;
  label?: string;
};

export type BackupResult = {
  blob: Blob;
  filename: string;
  tables: number;
  rows: number;
  files: number;
  bytes: number;
  failedFiles: string[];
};

const PAGE_SIZE = 1000;
const FILE_CONCURRENCY = 4;
const pad = (n: number) => String(n).padStart(2, "0");

export function backupFilename(now = new Date()) {
  return `aava-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

/** Há quantos dias foi o último backup (null = nunca). */
export function daysSince(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}

export const BACKUP_REMINDER_DAYS = 7;

const README = (createdAt: string, failed: string[]) => `BACKUP DA COMUNIDADE AAVA
Gerado em: ${createdAt}

O que tem aqui
- dados/<tabela>.json : o conteúdo de cada tabela do sistema (um arquivo por tabela, uma lista de registros).
- arquivos/<pasta>/<arquivo> : fotos, comprovantes, QR de Pix e mídias de eventos (se foram incluídos).
- backup.json : lista de tabelas, quantidade de registros e arquivos deste backup.

O que NÃO tem
- Senhas e contas de login (ficam protegidas no Supabase). Para recuperar o sistema inteiro, use também os backups do próprio Supabase.
- Tokens de notificação dos aparelhos.

CUIDADO: este arquivo contém dados pessoais e sensíveis (CPF, religião, pedidos de oração, financeiro).
Guarde em lugar privado e seguro, não envie por WhatsApp nem e-mail e apague as cópias antigas que não precisa mais.
${failed.length ? `\nArquivos que não puderam ser baixados (${failed.length}):\n${failed.map((f) => `- ${f}`).join("\n")}\n` : ""}`;

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

export async function createBackup(opts: {
  includeFiles: boolean;
  onProgress?: (p: BackupProgress) => void;
}): Promise<BackupResult> {
  const { strToU8, zipSync } = await import("fflate");
  const report = (p: BackupProgress) => opts.onProgress?.(p);
  const startedAt = new Date();
  const zip: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};

  const { data: tables, error: tablesError } = await supabase.rpc("backup_tables");
  if (tablesError) throw tablesError;

  let rows = 0;
  const manifestTables: { name: string; rows: number }[] = [];
  for (let i = 0; i < (tables ?? []).length; i++) {
    const t = tables![i]!;
    report({ phase: "tabelas", done: i, total: tables!.length, label: t.table_name });
    const all: unknown[] = [];
    for (let offset = 0; offset < Number(t.row_count); offset += PAGE_SIZE) {
      const { data, error } = await supabase.rpc("backup_table_page", {
        _table: t.table_name,
        _offset: offset,
        _limit: PAGE_SIZE,
      });
      if (error) throw error;
      all.push(...((data as unknown[]) ?? []));
    }
    rows += all.length;
    manifestTables.push({ name: t.table_name, rows: all.length });
    zip[`dados/${t.table_name}.json`] = strToU8(JSON.stringify(all));
  }
  report({ phase: "tabelas", done: tables?.length ?? 0, total: tables?.length ?? 0 });

  const failedFiles: string[] = [];
  let files = 0;
  const manifestFiles: { bucket: string; path: string; size: number }[] = [];
  if (opts.includeFiles) {
    const { data: objects, error: objectsError } = await supabase.rpc("backup_storage_objects");
    if (objectsError) throw objectsError;
    const list = objects ?? [];
    let done = 0;
    await mapLimit(list, FILE_CONCURRENCY, async (o) => {
      try {
        const { data, error } = await supabase.storage.from(o.bucket).download(o.name);
        if (error || !data) throw error ?? new Error("vazio");
        const u8 = new Uint8Array(await data.arrayBuffer());
        zip[`arquivos/${o.bucket}/${o.name}`] = [u8, { level: 0 }];
        files += 1;
        manifestFiles.push({ bucket: o.bucket, path: o.name, size: u8.byteLength });
      } catch {
        failedFiles.push(`${o.bucket}/${o.name}`);
      }
      report({ phase: "arquivos", done: ++done, total: list.length, label: o.name });
    });
  }

  zip["backup.json"] = strToU8(
    JSON.stringify(
      {
        created_at: startedAt.toISOString(),
        tables: manifestTables,
        files: manifestFiles,
        failed_files: failedFiles,
      },
      null,
      2,
    ),
  );
  zip["LEIAME.txt"] = strToU8(README(startedAt.toLocaleString("pt-BR"), failedFiles));

  report({ phase: "compactando", done: 0, total: 1 });
  const out = zipSync(zip, { level: 6 });
  const blob = new Blob([out as BlobPart], { type: "application/zip" });

  // O registro do backup é só um aviso de "quando foi o último"; se falhar, o backup em si vale do mesmo jeito.
  await supabase.rpc("backup_record", {
    _tables: manifestTables.length,
    _rows: rows,
    _files: files,
    _bytes: blob.size,
    _source: "painel",
  });
  report({ phase: "pronto", done: 1, total: 1 });

  return {
    blob,
    filename: backupFilename(startedAt),
    tables: manifestTables.length,
    rows,
    files,
    bytes: blob.size,
    failedFiles,
  };
}
