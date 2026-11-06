import { createFileRoute } from "@tanstack/react-router";
import { siteMeta } from "@/lib/site-query";
import { VisitorsPage } from "@/components/members/VisitorsPage";

export const Route = createFileRoute("/_authenticated/painel/visitantes")({
  head: () => siteMeta("Visitantes — Comunidade Aava", "Pessoas que se cadastraram como visitantes e de onde vieram."),
  component: VisitorsPage,
});
