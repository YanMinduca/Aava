import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, HandHeart, Minus, Network, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/church";
import { activeGoals, tithersSummary, upcomingEvents } from "@/lib/dashboard";
import { fmtLongDate, fmtTime } from "@/lib/events";
import type { Json } from "@/integrations/supabase/types";

const card = "rounded-2xl border bg-card p-6 transition-shadow hover:shadow-soft";
const label = "flex items-center gap-2 text-sm text-muted-foreground";
const big = "mt-2 font-display text-4xl text-foreground";
const PRAYER_STATUS: Record<string, string> = { recebido: "Recebido", em_oracao: "Em oração", concluido: "Concluído" };

/** Voluntários (membros em algum departamento) e departamentos. */
export function VolunteerCards() {
  // Só para quem recebeu a permissão de departamentos (membro comum não vê estes números)
  const { can } = useAccess();
  const allowed = can("manage_departments") || can("view_departments");
  const stats = useQuery({
    queryKey: ["dashboard-volunteers"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_volunteer_stats");
      if (error) throw error;
      return data as Json as { departments: number; volunteers: number };
    },
  });
  const s = stats.data;
  if (!allowed) return null;
  return (
    <>
      <Link to="/painel/departamentos" className={card}>
        <p className={label}><Users className="h-4 w-4" /> Voluntários</p>
        <p className={big}>{s?.volunteers ?? "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Pessoas em pelo menos um departamento</p>
      </Link>
      <Link to="/painel/departamentos" className={card}>
        <p className={label}><Network className="h-4 w-4" /> Departamentos</p>
        <p className={big}>{s?.departments ?? "—"}</p>
      </Link>
    </>
  );
}

/** Dizimistas do mês e metas financeiras (usa as mesmas movimentações da tela Financeiro). */
export function FinanceCards() {
  const { can } = useAccess();
  const tx = useQuery({
    queryKey: ["dashboard-transactions"],
    enabled: can("view_finance"),
    queryFn: async () => (await supabase.from("financial_transactions").select("*")).data ?? [],
  });
  const goals = useQuery({
    queryKey: ["dashboard-goals"],
    enabled: can("view_finance"),
    queryFn: async () => (await supabase.from("financial_goals").select("*").order("created_at")).data ?? [],
  });
  if (!can("view_finance")) return null;

  const all = tx.data ?? [];
  const t = tithersSummary(all);
  const monthName = new Date().toLocaleDateString("pt-BR", { month: "long" });
  const Trend = t.trend === "up" ? TrendingUp : t.trend === "down" ? TrendingDown : Minus;
  const trendColor = t.trend === "up" ? "text-success" : t.trend === "down" ? "text-destructive" : "text-muted-foreground";
  const trendText =
    t.trend === "same" ? "Igual ao mês anterior" : `${t.delta > 0 ? "+" : ""}${t.delta} em relação ao mês anterior (${t.previous})`;
  const top = activeGoals(goals.data ?? [], all);

  return (
    <>
      <Link to="/painel/financeiro" className={card}>
        <p className={label}><HandHeart className="h-4 w-4" /> Dizimistas</p>
        <div className="mt-2 flex items-center gap-3">
          <p className="font-display text-4xl text-foreground">{tx.data ? t.current : "—"}</p>
          {tx.data && <Trend className={`h-7 w-7 ${trendColor}`} aria-label={t.trend === "up" ? "Aumento" : t.trend === "down" ? "Queda" : "Estável"} />}
        </div>
        <p className="mt-1 text-xs capitalize text-muted-foreground">Pessoas que dizimaram em {monthName}</p>
        {tx.data && <p className={`mt-1 text-xs ${trendColor}`}>{trendText}</p>}
        {tx.data && <p className="mt-1 text-xs text-muted-foreground">Mês em andamento · dízimos sem membro não entram</p>}
      </Link>

      <Link to="/painel/financeiro" className={`${card} md:col-span-2`}>
        <p className={label}><Target className="h-4 w-4" /> Metas financeiras</p>
        {goals.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>
        ) : top.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma meta em andamento.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {top.map(({ goal, raised, target, pct }) => (
              <div key={goal.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{goal.title}</span>
                  <span className="shrink-0 text-muted-foreground">{Math.round(pct)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{brl(raised)} de {brl(target)}</p>
              </div>
            ))}
          </div>
        )}
      </Link>
    </>
  );
}

/** Quantidade de eventos programados e o mais próximo. */
export function EventsCard() {
  const { can } = useAccess();
  const staff = can("manage_events") || can("verify_event_payments") || can("checkin_events");
  const events = useQuery({
    queryKey: ["dashboard-events"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("events")
        .select("id, slug, title, starts_at, ends_at, published")
        .or(`ends_at.gte.${now},starts_at.gte.${now}`)
        .order("starts_at");
      return data ?? [];
    },
  });
  const list = upcomingEvents(events.data ?? []);
  const next = list[0];
  const body = (
    <>
      <p className={label}><CalendarDays className="h-4 w-4" /> Eventos</p>
      <p className={big}>{events.isLoading ? "—" : list.length}</p>
      <p className="mt-1 text-xs text-muted-foreground">{list.length === 1 ? "evento programado" : "eventos programados"}</p>
      {next ? (
        <div className="mt-4 border-t pt-3">
          <p className="text-xs text-muted-foreground">Mais próximo</p>
          <p className="mt-0.5 font-medium text-foreground">{next.title}</p>
          <p className="text-xs capitalize text-muted-foreground">{fmtLongDate(next.starts_at)} · {fmtTime(next.starts_at)}</p>
        </div>
      ) : (
        !events.isLoading && <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">Nenhum evento programado.</p>
      )}
    </>
  );
  if (next && staff) return <Link to="/painel/evento/$id" params={{ id: next.id }} className={card}>{body}</Link>;
  if (next) return <Link to="/eventos/$slug" params={{ slug: next.slug }} className={card}>{body}</Link>;
  return <Link to={staff ? "/painel/eventos" : "/eventos"} className={card}>{body}</Link>;
}

/** Pedido de oração mais recente (quem vê todos os pedidos vê o último de todos; os demais, o seu). */
export function PrayerCard() {
  const { can } = useAccess();
  const latest = useQuery({
    queryKey: ["dashboard-prayer"],
    enabled: can("view_prayer_requests"),
    queryFn: async () => {
      const { data } = await supabase.from("prayer_requests").select("id, subject, message, status, created_at").order("created_at", { ascending: false }).limit(1);
      return data?.[0] ?? null;
    },
  });
  if (!can("view_prayer_requests")) return null;
  const p = latest.data;
  return (
    <Link to="/painel/oracao" className={`${card} md:col-span-3`}>
      <p className={label}><HandHeart className="h-4 w-4" /> Pedido de oração mais recente</p>
      {latest.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando...</p>
      ) : !p ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum pedido de oração ainda.</p>
      ) : (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-medium text-foreground">{p.subject}</p>
            <Badge variant="secondary">{PRAYER_STATUS[p.status] ?? p.status}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.message}</p>
        </div>
      )}
    </Link>
  );
}
