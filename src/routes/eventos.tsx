import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { PageError } from "@/components/site/PageError";
import { EventCard, usePublicEvents } from "@/components/events/EventsList";
import { siteMeta } from "@/lib/site-query";

export const Route = createFileRoute("/eventos")({
  head: () => siteMeta("Eventos — Comunidade Aava", "Veja os próximos eventos da Comunidade Aava e faça sua inscrição."),
  errorComponent: PageError,
  notFoundComponent: PageError,
  component: EventsPage,
});

function EventsPage() {
  const { data = [], isLoading } = usePublicEvents();
  return (
    <SiteLayout>
      <PageHeader eyebrow="AGENDA" title="Eventos" text="Escolha um evento para ver os detalhes e fazer sua inscrição." />
      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : data.length === 0 ? (
          <p className="text-muted-foreground">Nenhum evento disponível no momento. Volte em breve!</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.map((e) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>
    </SiteLayout>
  );
}
