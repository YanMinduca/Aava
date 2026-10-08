import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { ContributionContent } from "@/components/site/ContributionContent";
import { PageError } from "@/components/site/PageError";
import { siteMeta, siteQuery, useSiteContent } from "@/lib/site-query";

export const Route = createFileRoute("/contribuicao")({
  loader: ({ context }) => context.queryClient.ensureQueryData(siteQuery),
  head: ({ loaderData: c }) =>
    siteMeta(
      `${c?.contributionTitle ?? "Contribuição"} — ${c?.name ?? "Comunidade Aava"}`,
      c?.contributionText ?? "Formas de contribuir com a comunidade.",
    ),
  errorComponent: PageError,
  notFoundComponent: PageError,
  component: Contribution,
});

function Contribution() {
  const c = useSiteContent();
  return (
    <SiteLayout>
      <PageHeader
        eyebrow={c.contributionEyebrow}
        title={c.contributionTitle}
        text={c.contributionText}
      />
      {c.pixKeys.length || c.methods.length ? (
        <ContributionContent content={c} />
      ) : (
        <p className="mx-auto max-w-7xl px-5 py-16 text-muted-foreground lg:px-10">
          {c.contributionEmpty}
        </p>
      )}
    </SiteLayout>
  );
}
