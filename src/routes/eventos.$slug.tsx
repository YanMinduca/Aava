import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageError } from "@/components/site/PageError";
import { Markdown } from "@/components/site/Markdown";
import { EventRegistration } from "@/components/events/EventRegistration";
import { Badge } from "@/components/ui/badge";
import { asEventDetail, fmtDate, fmtLongDate, fmtTime, moneyBR } from "@/lib/events";
import { siteMeta } from "@/lib/site-query";

export const Route = createFileRoute("/eventos/$slug")({
  head: () => siteMeta("Evento — Comunidade Aava", "Detalhes e inscrição do evento."),
  errorComponent: PageError,
  notFoundComponent: PageError,
  component: EventPage,
});

function EventPage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["public-event", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_event", { _slug: slug });
      if (error) throw error;
      return asEventDetail(data);
    },
  });

  return (
    <SiteLayout>
      <section className="mx-auto max-w-5xl px-5 py-10 lg:px-10">
        <Link to="/eventos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Todos os eventos
        </Link>
        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Carregando...</p>
        ) : !data ? (
          <p className="mt-8 text-muted-foreground">Evento não encontrado ou indisponível.</p>
        ) : (
          <div className="mt-6 grid gap-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={data.event.audience === "members" ? "outline" : "secondary"}>
                  {data.event.audience === "members" ? "Evento para membros" : "Aberto ao público"}
                </Badge>
              </div>
              <h1 className="mt-4 text-4xl text-foreground">{data.event.title}</h1>
              <p className="mt-5 flex items-start gap-2 text-foreground">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <span className="capitalize">{fmtLongDate(data.event.starts_at)}</span> às {fmtTime(data.event.starts_at)}
                  {data.event.ends_at && <span className="text-muted-foreground"> · até {fmtTime(data.event.ends_at)}</span>}
                </span>
              </p>
              {data.event.location && (
                <p className="mt-2 flex items-start gap-2 text-foreground">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> {data.event.location}
                </p>
              )}
              {(data.event.registration_opens_at || data.event.registration_closes_at) && (
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Inscrições{data.event.registration_opens_at ? ` de ${fmtDate(data.event.registration_opens_at)}` : ""}
                  {data.event.registration_closes_at ? ` até ${fmtDate(data.event.registration_closes_at)}` : ""}
                </p>
              )}
              {data.event.description && <Markdown className="mt-8 text-base leading-relaxed text-muted-foreground">{data.event.description}</Markdown>}

              {data.lots.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-xl text-foreground">{data.lots.length > 1 ? "Lotes" : "Ingresso"}</h2>
                  <div className="mt-3 divide-y rounded-xl border bg-card">
                    {data.lots.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{l.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.spots_left === null ? "Vagas ilimitadas" : l.spots_left === 0 ? "Esgotado" : `${l.spots_left} vagas restantes`}
                            {data.event.audience === "members" && ` · ${l.public_access ? "aberto ao público" : "só membros"}`}
                          </p>
                        </div>
                        <p className="font-semibold text-foreground">{data.event.payment_enabled && l.price > 0 ? moneyBR(l.price) : "Gratuito"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="lg:sticky lg:top-24 lg:self-start">
              <EventRegistration detail={data} />
            </div>
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
