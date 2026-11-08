import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { PERMISSION_GROUPS, ROLE_LABELS } from "@/lib/church";
import { siteMeta } from "@/lib/site-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/painel/atividades")({
  head: () =>
    siteMeta(
      "Registro de atividades — Comunidade Aava",
      "Quem fez o quê no painel da Comunidade Aava.",
    ),
  component: ActivityLogPage,
});

type Action = "create" | "update" | "delete";

type LogRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: Action;
  entity: string;
  summary: string;
  changed_fields: string[] | null;
};

type RpcResult = Promise<{ data: LogRow[] | null; error: { message: string } | null }>;

const PAGE = 50;

const ENTITY_FILTERS: { id: string | null; label: string }[] = [
  { id: null, label: "Tudo" },
  { id: "members", label: "Membros" },
  { id: "financial", label: "Financeiro" },
  { id: "access", label: "Acessos" },
  { id: "events", label: "Eventos" },
  { id: "departments", label: "Departamentos" },
  { id: "site", label: "Site" },
];

const ACTION_UI: Record<Action, { label: string; Icon: typeof Plus; tone: string }> = {
  create: {
    label: "Criou",
    Icon: Plus,
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  update: {
    label: "Editou",
    Icon: Pencil,
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  delete: {
    label: "Excluiu",
    Icon: Trash2,
    tone: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
};

// Nomes dos campos como o CEO entende (o banco guarda só o nome do campo, nunca o valor).
const FIELD_LABELS: Record<string, string> = {
  full_name: "nome",
  cpf: "CPF",
  rg: "RG",
  phone: "telefone",
  email: "e-mail",
  birth_date: "nascimento",
  address: "endereço",
  cep: "CEP",
  city: "cidade",
  marital_status: "estado civil",
  baptized: "batismo",
  status: "situação",
  approval_status: "aprovação",
  user_id: "conta vinculada",
  amount: "valor",
  category: "categoria",
  description: "descrição",
  kind: "tipo",
  occurred_on: "data",
  payment_method: "forma de pagamento",
  responsible: "responsável",
  notes: "observações",
  title: "título",
  name: "nome",
  starts_at: "início",
  ends_at: "fim",
  location: "local",
  published: "publicação",
  permissions: "permissões",
};

const PERMISSION_LABELS: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => [p.key, p.label] as const)),
);

// Troca "admin" / "view_finance" (códigos) pelos nomes em português quando existirem.
function prettify(summary: string): string {
  return summary.replace(/"([a-z_]+)"/g, (whole, key: string) => {
    const label = ROLE_LABELS[key] ?? PERMISSION_LABELS[key];
    return label ? `"${label}"` : whole;
  });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ActivityLogPage() {
  const { isCeo, isLoading } = useAccess();
  const [entity, setEntity] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Espera o CEO terminar de digitar antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A função é nova e ainda não está nos tipos gerados do Supabase, por isso o cast.
  const fetchPage = useCallback(
    async (before: string | null) => {
      const rpc = supabase.rpc as unknown as (fn: string, args: object) => RpcResult;
      return rpc.call(supabase, "activity_log_feed", {
        _limit: PAGE,
        _before: before,
        _entity: entity,
        _search: search || null,
      });
    },
    [entity, search],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchPage(null);
    if (err) {
      setError(
        err.message.includes("Acesso negado")
          ? "Só o CEO pode ver o registro de atividades."
          : "Não foi possível carregar o registro. Tente atualizar.",
      );
      setRows([]);
      setHasMore(false);
    } else {
      setRows(data ?? []);
      setHasMore((data?.length ?? 0) >= PAGE);
    }
    setLoading(false);
  }, [fetchPage]);

  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const { data, error: err } = await fetchPage(last.created_at);
    if (err) {
      setError("Não foi possível carregar mais registros. Tente novamente.");
    } else {
      setRows((prev) => [...prev, ...(data ?? [])]);
      setHasMore((data?.length ?? 0) >= PAGE);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    if (isCeo) void load();
  }, [isCeo, load]);

  const emptyText = useMemo(
    () =>
      search || entity
        ? "Nada encontrado com esse filtro."
        : "Ainda não há atividades registradas.",
    [search, entity],
  );

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!isCeo) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O registro de atividades é visível apenas para o CEO.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Registro de atividades</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Mostra quem criou, editou ou excluiu informações importantes (membros, financeiro,
          acessos, eventos e site). Em edições aparece apenas <strong>quais campos mudaram</strong>,
          nunca o conteúdo. Registros com mais de 12 meses são apagados automaticamente.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por pessoa ou assunto (ex.: Maria, lançamento)"
            aria-label="Buscar no registro de atividades"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Atualizar registro"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} aria-hidden="true" />
        </Button>
      </div>

      <div role="group" aria-label="Filtrar por área" className="flex flex-wrap gap-2">
        {ENTITY_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setEntity(f.id)}
            aria-pressed={entity === f.id}
            className={
              "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (entity === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      <section aria-label="Atividades registradas" className="rounded-lg border bg-card">
        {error ? (
          <p role="alert" className="p-8 text-center text-sm text-muted-foreground">
            {error}
          </p>
        ) : loading && rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const ui = ACTION_UI[r.action];
              const fields = (r.changed_fields ?? []).map((f) => FIELD_LABELS[f] ?? f);
              return (
                <li key={r.id} className="flex items-start gap-3 p-4">
                  <span className={"mt-0.5 rounded-full p-2 " + ui.tone}>
                    <ui.Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{ui.label}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{prettify(r.summary)}</p>
                    {fields.length > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Campos alterados: {fields.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {r.actor_name ?? "Sistema"}
                      </span>
                      {" · "}
                      <time dateTime={r.created_at}>{formatWhen(r.created_at)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && !error ? (
          <div className="border-t p-3 text-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Carregar mais
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
