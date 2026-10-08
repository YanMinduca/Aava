import { createFileRoute } from "@tanstack/react-router";
import { PrayerRequests } from "@/components/prayers/PrayerRequests";
import { siteMeta } from "@/lib/site-query";
import { useAccess } from "@/hooks/use-access";
export const Route = createFileRoute("/_authenticated/painel/oracao")({
  head: () =>
    siteMeta(
      "Pedidos de oração — Área de membros Aava",
      "Envie e acompanhe pedidos de oração da comunidade.",
    ),
  component: PanelPrayer,
});
function PanelPrayer() {
  const { can, isLoading } = useAccess();
  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!can("view_prayer_requests"))
    return <p>Você não tem permissão para ver pedidos de oração.</p>;
  return (
    <div>
      <h1 className="mb-8 text-3xl">Pedidos de oração</h1>
      <PrayerRequests />
    </div>
  );
}
