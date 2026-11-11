import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArchiveRestore, ChevronDown, ChevronUp, Lock, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { siteMeta } from "@/lib/site-query";
import { purgeStorageTrash } from "@/lib/storage-trash";
import { TRASH_DAYS, daysLeft, tableLabel, trashError } from "@/lib/trash";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/painel/lixeira")({
  head: () =>
    siteMeta("Lixeira — Comunidade Aava", "Itens excluídos que ainda podem ser restaurados."),
  component: TrashPage,
});

const PAGE = 50;
const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const kb = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function TrashPage() {
  const { isFullAccess, isLoading } = useAccess();
  const qc = useQueryClient();
  const [table, setTable] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setLimit(PAGE), [table, search]);

  const stats = useQuery({
    queryKey: ["trash", "stats"],
    enabled: isFullAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("trash_stats");
      if (error) throw error;
      return data as {
        items: number;
        groups: number;
        bytes: number;
        by_table: { table: string; groups: number }[];
      };
    },
  });

  const list = useQuery({
    queryKey: ["trash", "list", table, search, limit],
    enabled: isFullAccess,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("trash_list", {
        _limit: limit,
        _offset: 0,
        ...(table ? { _table: table } : {}),
        ...(search ? { _search: search } : {}),
      });
      if (error) throw error;
      return data;
    },
  });

  const items = useQuery({
    queryKey: ["trash", "items", openId],
    enabled: isFullAccess && openId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("trash_items", { _id: openId! });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["trash"] });
  // Restaurar mexe em dados de várias telas: manda todas recarregarem.
  const refreshApp = () => qc.invalidateQueries();

  const restore = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.rpc("trash_restore", { _id: id });
      if (error) throw error;
      return data as { restored?: number } | null;
    },
    onSuccess: (res) => {
      toast.success(
        `Restaurado${res?.restored && res.restored > 1 ? ` (${res.restored} itens)` : ""}`,
      );
      refreshApp();
    },
    onError: (e) => toast.error(trashError(e)),
  });

  const purge = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.rpc("trash_purge", { _ids: [id] });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Excluído de vez");
      void purgeStorageTrash();
      refresh();
    },
    onError: (e) => toast.error(trashError(e)),
  });

  const empty = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("trash_empty");
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`Lixeira esvaziada (${n} ${n === 1 ? "item" : "itens"})`);
      void purgeStorageTrash();
      refresh();
    },
    onError: (e) => toast.error(trashError(e)),
  });

  if (isLoading)
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (!isFullAccess) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A lixeira é visível apenas para o CEO e o Pastor Presidente.
        </p>
      </div>
    );
  }

  const rows = list.data ?? [];
  const total = rows[0]?.total ?? 0;
  const busy = restore.isPending || purge.isPending || empty.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Lixeira</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Tudo o que é excluído no sistema fica aqui por <strong>{TRASH_DAYS} dias</strong> e depois
          é apagado de vez (junto com as fotos e arquivos). Itens excluídos juntos, como um evento
          com suas inscrições, voltam juntos. Contas excluídas e o que ficou na lixeira há mais de{" "}
          {TRASH_DAYS} dias não podem ser recuperados.
        </p>
        {stats.data && (
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.data.items} {stats.data.items === 1 ? "registro" : "registros"} guardados · ocupa{" "}
            {kb(stats.data.bytes)} no banco
          </p>
        )}
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
            placeholder="Buscar pelo nome do item"
            aria-label="Buscar na lixeira"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy || (stats.data?.items ?? 0) === 0}
          onClick={() =>
            confirm(
              "Esvaziar a lixeira? Tudo o que está nela será apagado de vez e não dá para desfazer.",
            ) && empty.mutate()
          }
        >
          <Trash2 className="h-4 w-4" /> Esvaziar lixeira
        </Button>
      </div>

      {(stats.data?.by_table.length ?? 0) > 0 && (
        <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-2">
          {[
            { table: null as string | null, label: "Tudo" },
            ...(stats.data?.by_table ?? []).map((t) => ({
              table: t.table,
              label: `${tableLabel(t.table)} (${t.groups})`,
            })),
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setTable(f.table)}
              aria-pressed={table === f.table}
              className={
                "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (table === f.table
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <section aria-label="Itens na lixeira" className="rounded-lg border bg-card">
        {list.isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : list.isError ? (
          <p role="alert" className="p-8 text-center text-sm text-muted-foreground">
            Não foi possível carregar a lixeira. Tente atualizar.
          </p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {search || table ? "Nada encontrado com esse filtro." : "A lixeira está vazia."}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {r.label || "(sem nome)"}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{tableLabel(r.table_name)}</Badge>
                      {r.items > 1 && (
                        <Badge variant="secondary">
                          + {r.items - 1}{" "}
                          {r.items - 1 === 1 ? "item relacionado" : "itens relacionados"}
                        </Badge>
                      )}
                      <span>
                        Excluído {r.deleted_by_name ? `por ${r.deleted_by_name} ` : ""}em{" "}
                        {when(r.deleted_at)} · some de vez em {daysLeft(r.expires_at)}{" "}
                        {daysLeft(r.expires_at) === 1 ? "dia" : "dias"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.items > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenId(openId === r.id ? null : r.id)}
                        aria-expanded={openId === r.id}
                      >
                        {openId === r.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}{" "}
                        Ver itens
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => restore.mutate(r.id)}
                    >
                      <ArchiveRestore className="h-4 w-4" /> Restaurar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          `Excluir "${r.label ?? "este item"}" de vez${r.items > 1 ? ` (e os ${r.items - 1} itens relacionados)` : ""}? Não dá para desfazer.`,
                        ) && purge.mutate(r.id)
                      }
                    >
                      <Trash2 className="h-4 w-4" /> Excluir de vez
                    </Button>
                  </div>
                </div>
                {openId === r.id && (
                  <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                    {items.isLoading && <li>Carregando…</li>}
                    {(items.data ?? []).map((i) => (
                      <li key={i.id}>
                        <span className="font-medium text-foreground/80">
                          {tableLabel(i.table_name)}
                        </span>
                        {i.label ? `: ${i.label}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {rows.length < total && (
          <div className="border-t p-3 text-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setLimit((l) => l + PAGE)}
              disabled={list.isFetching}
            >
              Carregar mais
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
