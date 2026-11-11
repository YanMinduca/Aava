#!/usr/bin/env node
/**
 * Backup completo do Aava feito fora do navegador (para agendar no seu computador/servidor).
 * Grava uma pasta com todas as tabelas em JSON e os arquivos do armazenamento.
 *
 * Uso:
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/backup.mjs [pasta-de-destino]
 *
 * A chave service_role dá acesso total: NÃO coloque em repositório público nem no código do site.
 * A pasta gerada tem dados pessoais e sensíveis: guarde em local privado (de preferência criptografado).
 * Por padrão grava em ./backups/aava-AAAA-MM-DD-HHMM (a pasta backups/ está no .gitignore).
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const out = process.argv[2] ?? join("backups", `aava-${stamp}`);
const PAGE = 1000;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const tables = must(await supabase.rpc("backup_tables"), "listar tabelas");
let rows = 0;
const manifestTables = [];
for (const t of tables) {
  const all = [];
  for (let offset = 0; offset < Number(t.row_count); offset += PAGE) {
    all.push(
      ...must(
        await supabase.rpc("backup_table_page", {
          _table: t.table_name,
          _offset: offset,
          _limit: PAGE,
        }),
        `ler ${t.table_name}`,
      ),
    );
  }
  rows += all.length;
  manifestTables.push({ name: t.table_name, rows: all.length });
  await mkdir(join(out, "dados"), { recursive: true });
  await writeFile(join(out, "dados", `${t.table_name}.json`), JSON.stringify(all));
  console.log(`✓ ${t.table_name}: ${all.length} registros`);
}

const objects = must(await supabase.rpc("backup_storage_objects"), "listar arquivos");
const failed = [];
let files = 0;
let bytes = 0;
for (const o of objects) {
  try {
    const { data, error } = await supabase.storage.from(o.bucket).download(o.name);
    if (error || !data) throw error ?? new Error("vazio");
    const buf = Buffer.from(await data.arrayBuffer());
    const dest = join(out, "arquivos", o.bucket, o.name);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    files += 1;
    bytes += buf.length;
  } catch {
    failed.push(`${o.bucket}/${o.name}`);
  }
}
console.log(
  `✓ ${files} arquivos (${(bytes / 1048576).toFixed(1)} MB)${failed.length ? `, ${failed.length} falharam` : ""}`,
);

await writeFile(
  join(out, "backup.json"),
  JSON.stringify(
    { created_at: now.toISOString(), tables: manifestTables, files, failed_files: failed },
    null,
    2,
  ),
);
await supabase.rpc("backup_record", {
  _tables: manifestTables.length,
  _rows: rows,
  _files: files,
  _bytes: bytes,
  _source: "script",
});
console.log(`Backup gravado em ${out}`);
if (failed.length) process.exitCode = 2;
