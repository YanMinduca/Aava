import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { brl } from "@/lib/church";
import { siteMeta } from '@/lib/site-query';

export const Route = createFileRoute("/_authenticated/painel/")({
  head: () => siteMeta('Visão geral — Comunidade Aava', 'Área de membros e gestão da Comunidade Aava.'),
  component: Overview,
});

function Overview() {
  const { can, isLoading } = useAccess();
  const members = useQuery({
    queryKey: ["members-count"],
    enabled: can("view_members"),
    queryFn: async () => (await supabase.from("members").select("id", { count: "exact", head: true })).count ?? 0,
  });
  const fin = useQuery({
    queryKey: ["fin-summary"],
    enabled: can("view_finance"),
    queryFn: async () => {
      const { data } = await supabase.from("financial_transactions").select("kind, amount");
      let inc = 0, out = 0;
      (data ?? []).forEach((t) => (t.kind === "entrada" ? (inc += Number(t.amount)) : (out += Number(t.amount))));
      return { inc, out };
    },
  });

  if (isLoading) return null;
  const nothing = !can("view_members") && !can("view_finance");

  return (
    <div>
      <h1 className="text-3xl text-foreground">Visão geral</h1>
      {nothing ? (
        <p className="mt-4 text-muted-foreground">
          Bem-vindo à comunidade! Acesse seu cadastro, envie um pedido de oração ou conheça as formas de contribuir.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {can("view_members") && (
            <Link to="/painel/membros" className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-soft">
              <p className="text-sm text-muted-foreground">Membros cadastrados</p>
              <p className="mt-2 font-display text-4xl text-foreground">{members.data ?? "—"}</p>
            </Link>
          )}
          {can("view_finance") && (
            <>
              <Link to="/painel/financeiro" className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-soft">
                <p className="text-sm text-muted-foreground">Saldo</p>
                <p className="mt-2 font-display text-4xl text-foreground">{fin.data ? brl(fin.data.inc - fin.data.out) : "—"}</p>
              </Link>
              <div className="rounded-2xl border bg-card p-6">
                <p className="text-sm text-muted-foreground">Entradas / Saídas</p>
                <p className="mt-2 text-lg text-success">{fin.data ? brl(fin.data.inc) : "—"}</p>
                <p className="text-lg text-destructive">{fin.data ? brl(fin.data.out) : "—"}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
