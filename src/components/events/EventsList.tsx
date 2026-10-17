import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarDays, MapPin, Ticket, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDate, fmtLongDate, fmtTime, moneyBR } from "@/lib/events";
import type { Database } from "@/integrations/supabase/types";

type EventRow = Database["public"]["Functions"]["public_events"]["Returns"][number];

export function usePublicEvents() {
  return useQuery({
    queryKey: ["public-events"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_events");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function registrationLabel(e: EventRow) {
  const now = new Date();
  if (e.registration_opens_at && new Date(e.registration_opens_at) > now) return `Inscrições a partir de ${fmtDate(e.registration_opens_at)}`;
  if (e.registration_closes_at && new Date(e.registration_closes_at) < now) return "Inscrições encerradas";
  if (e.spots_left === 0) return "Vagas esgotadas";
  return e.registration_closes_at ? `Inscrições até ${fmtDate(e.registration_closes_at)}` : "Inscrições abertas";
}

export function EventCard({ e }: { e: EventRow }) {
  const open = e.registration_open && e.spots_left !== 0;
  return (
    <Link
      to="/eventos/$slug"
      params={{ slug: e.slug }}
      className="group flex flex-col rounded-2xl border bg-card p-6 transition-colors hover:border-primary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={open ? "default" : "secondary"}>{registrationLabel(e)}</Badge>
        {e.audience === "members" && <Badge variant="outline">Para membros</Badge>}
      </div>
      <h3 className="mt-4 text-xl text-foreground">{e.title}</h3>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="h-4 w-4 shrink-0" />
        <span className="capitalize">{fmtLongDate(e.starts_at)}</span> · {fmtTime(e.starts_at)}
      </p>
      {e.location && (
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" /> {e.location}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Ticket className="h-4 w-4 text-primary" />
          {!e.payment_enabled || !e.min_price ? "Gratuito" : `A partir de ${moneyBR(e.min_price)}`}
        </span>
        {e.spots_left !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" /> {e.spots_left === 0 ? "Esgotado" : `${e.spots_left} vagas`}
          </span>
        )}
      </div>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        Ver detalhes <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Seção da landing page: próximos eventos. Some sozinha se não houver nenhum evento publicado. */
export function EventsSection() {
  const { data = [] } = usePublicEvents();
  if (data.length === 0) return null;
  const shown = data.slice(0, 3);
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10" id="eventos">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-primary">AGENDA</p>
          <h2 className="mt-2 text-3xl">Eventos</h2>
        </div>
        {data.length > shown.length && (
          <Button asChild variant="outline">
            <Link to="/eventos">
              Ver todos os eventos <ArrowUpRight />
            </Link>
          </Button>
        )}
      </div>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((e) => (
          <EventCard key={e.id} e={e} />
        ))}
      </div>
    </section>
  );
}
