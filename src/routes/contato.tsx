import { createFileRoute } from "@tanstack/react-router";
import { Facebook, Instagram, MapPin, MessageCircle, Youtube } from "lucide-react";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { PageError } from "@/components/site/PageError";
import { siteQuery, siteMeta, useSiteContent } from "@/lib/site-query";
import { safeLink } from "@/lib/site-content";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/contato")({
  loader: ({ context }) => context.queryClient.ensureQueryData(siteQuery),
  head: ({ loaderData: c }) =>
    siteMeta(
      `${c?.navContact ?? "Contato"} — ${c?.name ?? "Comunidade Aava"}`,
      `Encontre ${c?.name ?? "a comunidade"} em ${c?.city ?? "Jacareí"}.`,
    ),
  errorComponent: PageError,
  notFoundComponent: PageError,
  component: Contact,
});

function Contact() {
  const c = useSiteContent();
  const q = encodeURIComponent(c.mapsQuery);
  const socialLinks = [
    { label: "Instagram", url: c.instagramUrl, Icon: Instagram },
    { label: "Facebook", url: c.facebookUrl, Icon: Facebook },
    { label: "YouTube", url: c.youtubeUrl, Icon: Youtube },
    { label: "WhatsApp", url: c.whatsappUrl, Icon: MessageCircle },
  ].filter((social) => safeLink(social.url));

  return (
    <SiteLayout>
      <PageHeader eyebrow={c.contactEyebrow} title={c.contactTitle} text={c.contactText} />
      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-[1fr_1.5fr] lg:px-10">
        <div className="space-y-8">
          <div className="flex gap-3">
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <h2 className="text-lg">{c.addressLabel}</h2>
              <p className="mt-3 text-muted-foreground">
                {c.address}
                <br />
                {c.city}
              </p>
              <Button asChild variant="link" className="mt-2 px-0">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${q}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.mapsLabel} →
                </a>
              </Button>
            </div>
          </div>
          {c.phone && <p>{c.phone}</p>}
          {c.email && <p>{c.email}</p>}
          {socialLinks.length > 0 && (
            <div>
              <h2 className="text-lg">{c.socialLabel}</h2>
              <div className="mt-3 flex flex-wrap gap-3">
                {socialLinks.map(({ label, url, Icon }) => (
                  <Button key={label} asChild variant="outline">
                    <a href={safeLink(url)} target="_blank" rel="noreferrer">
                      <Icon />
                      {label}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <iframe
          title="Mapa da igreja"
          className="h-80 w-full border"
          loading="lazy"
          src={`https://www.google.com/maps?q=${q}&output=embed`}
        />
      </section>
    </SiteLayout>
  );
}
