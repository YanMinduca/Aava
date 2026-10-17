import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EventForm, blankEvent } from "@/components/events/EventForm";
import { fmtDateTime } from "@/lib/events";
import { siteMeta } from "@/lib/site-query";

export const Route = createFileRoute("/_authenticated/painel/eventos")({
  head: () => siteMeta("Eventos — Comunidade Aava", "Gerencie eventos, inscrições, pagamentos e presença."),
  component: EventsAdmin,
});

function EventsAdmin() {
  const { can, isLoading } = useAccess();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const allowed = can("manage_events") || can("verify_event_payments") || can("checkin_events");
  const events = useQuery({
    queryKey: ["admin-events"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return null;
  if (!allowed) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">Eventos</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Crie eventos, acompanhe inscrições e pagamentos e registre a presença pelo QR code.</p>
        </div>
        {can("manage_events") && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Adicionar evento</Button>}
      </div>

      {events.isLoading && <p className="mt-6 text-muted-foreground">Carregando...</p>}
      {!events.isLoading && (events.data ?? []).length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 h-6 w-6" /> Nenhum evento ainda.
        </div>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(events.data ?? []).map((e) => (
          <Link key={e.id} to="/painel/evento/$id" params={{ id: e.id }} className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary">
            <div className="flex flex-wrap gap-2">
              <Badge variant={e.published ? "default" : "secondary"}>{e.published ? "Publicado" : "Rascunho"}</Badge>
              {e.audience === "members" && <Badge variant="outline">Só membros</Badge>}
              {e.payment_enabled && <Badge variant="outline">Com pagamento</Badge>}
            </div>
            <p className="mt-3 font-display text-lg text-foreground">{e.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(e.starts_at)}</p>
          </Link>
        ))}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Novo evento</DialogTitle></DialogHeader>
          <EventForm initial={blankEvent()} onSaved={(id) => { setCreating(false); navigate({ to: "/painel/evento/$id", params: { id } }); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
