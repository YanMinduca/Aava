#!/usr/bin/env node
/**
 * limpar-lovable.mjs — projeto Aava
 *
 * Uso (na RAIZ do projeto, onde fica o package.json):
 *
 *   node limpar-lovable.mjs --diagnostico   -> só testa o backend e mostra o erro real (não altera nada)
 *   node limpar-lovable.mjs                 -> remove as referências ao Lovable + roda o diagnóstico
 *   node limpar-lovable.mjs --sem-npm       -> igual ao anterior, mas não executa "npm uninstall"
 *
 * Dica: faça um commit (ou crie um branch) antes de rodar a limpeza, para poder revisar o diff.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const P = (...p) => path.join(root, ...p);
const exists = (p) => fs.existsSync(P(p));
const read = (p) => fs.readFileSync(P(p), "utf8");
const write = (p, s) => {
  fs.mkdirSync(path.dirname(P(p)), { recursive: true });
  fs.writeFileSync(P(p), s);
};
const rm = (p) => fs.rmSync(P(p), { recursive: true, force: true });
const ok = (m) => console.log(`  ✔ ${m}`);
const info = (m) => console.log(`  • ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const title = (m) => console.log(`\n=== ${m} ===`);

if (!exists("package.json")) {
  console.error("Não encontrei package.json aqui. Rode este script na raiz do projeto.");
  process.exit(1);
}

/** edita um arquivo se ele existir e se o conteúdo mudar */
function edit(file, fn, msg) {
  if (!exists(file)) return;
  const before = read(file);
  const after = fn(before);
  if (after !== before) {
    write(file, after);
    ok(msg ?? `${file} atualizado`);
  }
}

function parseEnv(file) {
  const out = {};
  if (!exists(file)) return out;
  for (const line of read(file).split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 1) DIAGNÓSTICO: o site chama o backend (Supabase) ao abrir a home.   */
/*    Se essa chamada falha, aparece "Não foi possível carregar...".   */
/* ------------------------------------------------------------------ */
async function diagnostico() {
  title("Diagnóstico do backend (a causa do erro ao abrir o site)");
  const env = parseEnv(".env");
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    warn("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY não estão no .env — preencha o .env e rode de novo.");
    return;
  }
  const host = new URL(url).host;
  info(`Testando: ${host}`);
  info(`Node: ${process.version}`);
  try {
    const res = await fetch(`${url}/rest/v1/site_content?select=content&id=eq.main`, {
      headers: { apikey: key, Accept: "application/vnd.pgrst.object+json" },
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.text()).slice(0, 300);
    info(`HTTP ${res.status} — ${body || "(sem corpo)"}`);
    if (res.ok) ok("O backend respondeu corretamente. Então o erro vem de outro ponto: rode `npm run dev` e leia o terminal / a caixa de erro que a página agora mostra.");
    else if (res.status === 406 && body.includes("PGRST116")) ok("Backend ok, só não existe a linha 'main' em site_content (o site usa os textos padrão).");
    else if (res.status === 404 || body.includes("PGRST205")) warn("A tabela site_content NÃO existe nesse backend. Aplique as migrations de drizzle/migrations (0000 a 0004) no seu Supabase.");
    else if (res.status === 401 || res.status === 403) warn("Chave recusada ou RLS bloqueando a leitura. Confira a SUPABASE_PUBLISHABLE_KEY e as policies de site_content.");
    else warn("O backend respondeu com erro. Projeto pausado/removido ou com falha? Veja o status HTTP acima.");
  } catch (e) {
    const code = e?.cause?.code || e?.cause?.errno || e?.name;
    warn(`Falha de rede ao falar com o backend: ${e?.message} (${code ?? "sem código"})`);
    if (code === "ENOTFOUND") warn("O endereço do backend não existe/não resolve: o projeto no Lovable Cloud pode ter sido removido ou o DNS está bloqueado. Solução definitiva: criar seu próprio projeto Supabase e trocar as chaves no .env.");
    else if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "TimeoutError", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH"].includes(String(code))) warn("Timeout/rede. Teste: NODE_OPTIONS=--dns-result-order=ipv4first npm run dev  (no Windows PowerShell: $env:NODE_OPTIONS='--dns-result-order=ipv4first'; npm run dev). Verifique também VPN/antivírus/proxy.");
    else if (String(code).includes("CERT") || String(code).includes("SELF_SIGNED")) warn("Problema de certificado (proxy/antivírus interceptando HTTPS).");
  }
}

if (args.has("--diagnostico")) {
  await diagnostico();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* 2) LIMPEZA                                                           */
/* ------------------------------------------------------------------ */
title("Removendo referências ao Lovable");

// 2.1 pasta .lovable
if (exists(".lovable")) {
  rm(".lovable");
  ok("pasta .lovable removida");
}

// 2.2 vite.config.ts — troca o wrapper do Lovable por plugins explícitos
write(
  "vite.config.ts",
  `import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Disponibiliza todas as variáveis do .env (não só as VITE_*) em process.env,
  // porque as server functions leem SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY de lá.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    server: { port: 8080 },
    resolve: {
      alias: { "@": \`\${process.cwd()}/src\` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // src/server.ts é o wrapper de erro de SSR do projeto
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Deploy: o Nitro detecta Vercel/Netlify/Cloudflare automaticamente.
      // Para forçar um destino: NITRO_PRESET=vercel npm run build
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
  };
});
`,
);
ok("vite.config.ts reescrito sem o pacote do Lovable");

// 2.3 package.json — nome do projeto
{
  const pkg = JSON.parse(read("package.json"));
  let changed = false;
  if (pkg.name === "tanstack_start_ts") {
    pkg.name = "aava";
    changed = true;
  }
  if (changed) {
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
    ok('package.json: name = "aava"');
  }
}

// 2.4 desinstala o pacote @lovable.dev/* (atualiza package.json e package-lock.json)
if (!args.has("--sem-npm")) {
  const pkg = JSON.parse(read("package.json"));
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const lov = Object.keys(all).filter((d) => d.startsWith("@lovable.dev/"));
  if (lov.length) {
    info(`npm uninstall ${lov.join(" ")} ...`);
    try {
      execSync(`npm uninstall ${lov.join(" ")}`, { stdio: "inherit" });
      ok("dependências do Lovable desinstaladas");
    } catch {
      warn("npm uninstall falhou. Rode manualmente: npm uninstall " + lov.join(" "));
    }
  }
} else {
  warn('Pulei o npm. Rode depois: npm uninstall @lovable.dev/vite-tanstack-config');
}

// 2.5 arquivos de bun (o projeto roda com npm; a lista de exceções do bunfig cita pacotes @lovable.dev)
if (exists("package-lock.json")) {
  for (const f of ["bun.lock", "bunfig.toml"]) {
    if (exists(f)) {
      rm(f);
      ok(`${f} removido (você usa npm)`);
    }
  }
}

// 2.6 README e AGENTS
write(
  "README.md",
  `# Aava

Site da Comunidade Aava.

## Desenvolvimento

\`\`\`bash
npm install
cp .env.example .env   # preencha com as chaves do SEU projeto Supabase
npm run dev            # http://localhost:8080
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Testes

\`\`\`bash
npm test
\`\`\`
`,
);
ok("README.md reescrito");

edit(
  "AGENTS.md",
  (s) => s.replace(/<!-- LOVABLE:BEGIN -->[\s\S]*?<!-- LOVABLE:END -->\s*/g, ""),
  "AGENTS.md: bloco do Lovable removido",
);

// 2.7 variáveis e mensagens com nome do Lovable
edit("drizzle.config.ts", (s) => s.replace(/LOVABLE_DB_MIGRATION_URL/g, "DATABASE_URL"), "drizzle.config.ts: LOVABLE_DB_MIGRATION_URL -> DATABASE_URL");
edit("src/integrations/supabase/cron-auth.ts", (s) => s.replace(/LOVABLE_CRON_SECRET/g, "CRON_SECRET"), "cron-auth.ts: LOVABLE_CRON_SECRET -> CRON_SECRET");
for (const f of ["client.ts", "client.server.ts", "auth-middleware.ts"]) {
  edit(
    `src/integrations/supabase/${f}`,
    (s) => s.replace(/Connect Supabase in Lovable Cloud\./g, "Defina essas variáveis no arquivo .env."),
    `${f}: mensagem de erro neutra`,
  );
}

// 2.8 sessão de login: sem o "broker" do editor do Lovable, usa localStorage
if (exists("src/integrations/supabase/previewAuthStorage.ts")) {
  edit("src/integrations/supabase/client.ts", (s) =>
    s
      .replace(/import \{ brokeredPreviewStorage \} from '\.\/previewAuthStorage';\r?\n/, "")
      .replace(/storage: brokeredPreviewStorage\(\),/, "storage: typeof window !== 'undefined' ? window.localStorage : undefined,"),
    "client.ts: sessão guardada em localStorage",
  );
  rm("src/integrations/supabase/previewAuthStorage.ts");
  ok("previewAuthStorage.ts removido");
}

// 2.9 reporter de erros do Lovable
if (exists("src/lib/lovable-error-reporting.ts")) {
  edit("src/routes/__root.tsx", (s) =>
    s
      .replace(/import \{ reportLovableError \} from "\.\.\/lib\/lovable-error-reporting";\r?\n/, "")
      .replace(/\s*useEffect\(\(\) => \{\s*reportLovableError\([^)]*\);\s*\}, \[error\]\);/, ""),
    "__root.tsx: sem reportLovableError",
  );
  rm("src/lib/lovable-error-reporting.ts");
  ok("lovable-error-reporting.ts removido");
}

// 2.10 .env fora do git + .env.example
{
  const env = parseEnv(".env");
  if (Object.keys(env).length) {
    write(".env.example", Object.keys(env).map((k) => `${k}=`).join("\n") + "\n");
    ok(".env.example criado (sem valores)");
  }
  edit(
    ".gitignore",
    (s) => (/^\.env$/m.test(s) ? s : s.replace(/\s*$/, "\n\n# Variáveis de ambiente\n.env\n.env.*\n!.env.example\n")),
    ".gitignore: .env ignorado",
  );
  try {
    execSync("git ls-files --error-unmatch .env", { stdio: "ignore" });
    execSync("git rm --cached .env", { stdio: "ignore" });
    ok(".env removido do controle de versão do git (o arquivo continua no seu disco)");
  } catch {
    /* não é repositório git, ou .env já não está versionado */
  }
}

// 2.11 melhorias que mostram o ERRO REAL (a página escondia a causa)
write(
  "src/components/site/PageError.tsx",
  `import { Link } from '@tanstack/react-router';

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string; code?: string };
    return [e.message, e.details, e.hint, e.code].filter(Boolean).join('\\n');
  }
  return error ? String(error) : '';
}

export function PageError(props: Record<string, unknown>) {
  const error = props['error'];
  if (error) console.error('[PageError]', error);
  const detail = describeError(error);
  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <h1 className="text-3xl">Não foi possível carregar esta página</h1>
      {import.meta.env.DEV && detail && (
        <pre className="mt-6 whitespace-pre-wrap rounded border p-4 text-xs">{detail}</pre>
      )}
      <Link to="/" className="mt-6 inline-block text-primary">Voltar ao início</Link>
    </div>
  );
}
`,
);
ok("PageError.tsx: em desenvolvimento mostra o erro real na tela");

edit(
  "src/lib/site-content.functions.ts",
  (s) => {
    if (s.includes("[getSiteContent]")) return s;
    const start = "export const getSiteContent = createServerFn({ method: 'GET' }).handler(async () => {";
    if (!s.includes(start)) return s;
    const body = s.slice(s.indexOf(start) + start.length).replace(/\}\);\s*$/, "");
    return (
      s.slice(0, s.indexOf(start)) +
      start +
      "\n  try {" +
      body.replace(/^/gm, "  ").replace(/\s+$/, "") +
      "\n  } catch (e) {\n    console.error('[getSiteContent]', e, (e as { cause?: unknown })?.cause ?? '');\n    throw e;\n  }\n});\n"
    );
  },
  "site-content.functions.ts: registra o erro no terminal",
);

/* ------------------------------------------------------------------ */
/* 3) RESUMO                                                            */
/* ------------------------------------------------------------------ */
title("O que ainda menciona 'lovable'");
const leftovers = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".git", "dist", ".output", ".nitro", ".tanstack"].includes(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full);
    else if (st.size < 2_000_000 && !/\.(jpg|png|ico|webp)$/i.test(name) && name !== path.basename(new URL(import.meta.url).pathname)) {
      const txt = fs.readFileSync(full, "utf8");
      txt.split(/\r?\n/).forEach((line, i) => {
        if (/lovable/i.test(line)) leftovers.push(`${path.relative(root, full)}:${i + 1}  ${line.trim().slice(0, 110)}`);
      });
    }
  }
}
walk(root);
if (leftovers.length) {
  leftovers.forEach((l) => info(l));
  warn(".env: a URL do backend (…lovable.cloud) é o seu banco ATUAL. Remover o Lovable do código não migra o banco.");
  warn("Para se desligar de vez: crie um projeto no supabase.com, aplique drizzle/migrations/*.sql e troque as chaves no .env.");
} else {
  ok("nenhuma referência restante");
}

await diagnostico();

console.log("\nPronto. Rode: npm install && npm run dev   (e abra http://localhost:8080)\n");
