import { useCallback, useEffect, useState } from "react";
import { Link2, RefreshCw, UserCheck, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Atividade recente de membros: novos cadastros, contas criadas e contas vinculadas.
 * Lê a função member_activity_feed do banco (só funciona para quem tem a permissão view_members).
 *
 * Uso: <MemberActivityFeed /> no topo da página de Membros.
 */

type Kind = "member_created" | "account_created" | "account_linked";

type ActivityRow = {
  id: string;
  kind: Kind;
  created_at: string;
  member_id: string | null;
  member_name: string | null;
  user_id: string | null;
  account_email: string | null;
  account_name: string | null;
  account_linked: boolean;
};

type Filter = "all" | "members" | "accounts";

const PAGE = 20;
const MAX = 100;
const TZ = "America/Sao_Paulo";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "members", label: "Novos membros" },
  { id: "accounts", label: "Contas" },
];

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  const key = dayKey(d);
  if (key === dayKey(new Date())) return `hoje, ${time}`;
  if (key === dayKey(new Date(Date.now() - 86_400_000))) return `ontem, ${time}`;
  return `${date} às ${time}`;
}

function describe(r: ActivityRow) {
  const who = r.account_name?.trim() || r.account_email || "Alguém";
  switch (r.kind) {
    case "member_created":
      return {
        Icon: UserPlus,
        title: (
          <>
            Novo membro cadastrado: <strong>{r.member_name ?? "sem nome"}</strong>
          </>
        ),
        badge: null as null | { text: string; ok: boolean },
      };
    case "account_created":
      return {
        Icon: UserCheck,
        title: (
          <>
            <strong>{who}</strong> criou uma conta
            {r.account_email && who !== r.account_email ? <span className="text-muted-foreground"> ({r.account_email})</span> : null}
          </>
        ),
        badge: r.account_linked
          ? { text: "Vinculada a um membro", ok: true }
          : { text: "Ainda sem vínculo", ok: false },
      };
    case "account_linked":
      return {
        Icon: Link2,
        title: (
          <>
            E-mail <strong>{r.account_email ?? who}</strong> vinculado ao membro <strong>{r.member_name ?? "sem nome"}</strong>
          </>
        ),
        badge: null,
      };
  }
}

type RpcResult = Promise<{ data: ActivityRow[] | null; error: { message: string } | null }>;

export function MemberActivityFeed() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // A função é nova e ainda não está nos tipos gerados do Supabase, por isso o cast.
    const rpc = supabase.rpc as unknown as (fn: string, args: object) => RpcResult;
    const { data, error: err } = await rpc.call(supabase, "member_activity_feed", { _limit: limit });
    if (err) {
      setError(
        err.message.includes("Acesso negado")
          ? "Você não tem permissão para ver a atividade de membros."
          : "Não foi possível carregar a atividade. Tente atualizar.",
      );
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((r) =>
    filter === "all" ? true : filter === "members" ? r.kind === "member_created" : r.kind !== "member_created",
  );
  const canLoadMore = rows.length >= limit && limit < MAX;

  return (
    <section aria-labelledby="atividade-titulo" className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="atividade-titulo" className="text-lg font-semibold">
          Atividade recente
        </h2>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Filtrar atividade" className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={
                  "rounded-md px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="Atualizar atividade"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
          {error}
        </p>
      ) : loading && rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma atividade por aqui ainda.</p>
      ) : (
        <ul className="divide-y">
          {visible.map((r) => {
            const { Icon, title, badge } = describe(r);
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 rounded-full bg-muted p-2 text-muted-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <time dateTime={r.created_at} className="text-xs text-muted-foreground">
                      {formatWhen(r.created_at)}
                    </time>
                    {badge ? (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs " +
                          (badge.ok
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200")
                        }
                      >
                        {badge.text}
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canLoadMore && !error ? (
        <div className="pt-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => Math.min(l + PAGE, MAX))}
            disabled={loading}
            className="rounded-md px-3 py-1.5 text-sm text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            Ver mais
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default MemberActivityFeed;
