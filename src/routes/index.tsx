import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Heart, BookOpen, Users, Instagram, ArrowRight } from 'lucide-react';
import hero from '@/assets/hero.jpg';
import { SiteLayout } from '@/components/site/SiteLayout';
import { Button } from '@/components/ui/button';
import { PageError } from '@/components/site/PageError';
import { siteQuery, siteMeta, useSiteContent } from '@/lib/site-query';
import { safeLink } from '@/lib/site-content';
import { instagramEmbed } from '@/lib/access-rules';
export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(siteQuery),
  head: ({ loaderData: c }) => siteMeta(c?.name ?? 'Comunidade Aava', c?.heroText ?? 'Uma família de fé em Jacareí.'),
  errorComponent: PageError, notFoundComponent: PageError, component: Home,
});
function Home() {
  const c = useSiteContent(); const embed = instagramEmbed(c.instagramVideo);
  const cover = c.photos[0]?.url || hero;
  return <SiteLayout>
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 md:grid-cols-[1.1fr_0.9fr] md:py-16 lg:px-10">
      <div className="site-reveal"><p className="text-xs font-bold text-primary">{c.heroEyebrow}</p><h1 className="mt-6 text-5xl leading-tight md:text-6xl">{c.heroTitle}<span className="mt-2 block text-primary">{c.heroSubtitle}</span></h1><p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground">{c.heroText}</p><div className="mt-8 flex flex-wrap gap-3"><Button asChild size="lg"><Link to="/cultos">{c.heroPrimary}<ArrowUpRight /></Link></Button><Button asChild variant="outline" size="lg"><Link to="/oracao">{c.heroSecondary}<ArrowRight /></Link></Button></div><p className="mt-10 border-l-2 border-primary pl-4 text-sm font-semibold">{c.gatheringTitle}<span className="mt-1 block font-normal text-muted-foreground">{c.gatheringText}</span></p></div>
      <div className="site-reveal min-w-0">{embed ? <iframe title={c.videoLabel} src={embed} className="h-[470px] w-full border bg-card" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /> : <div className="relative h-[410px] overflow-hidden bg-ink"><img src={cover} alt={c.photos[0]?.caption || 'Interior da igreja'} className="h-full w-full object-cover"/><div className="absolute inset-x-0 bottom-0 bg-ink/85 px-6 py-5 text-ink-foreground"><Instagram className="mb-3 h-5 w-5"/><p className="text-xl font-semibold">{c.videoLabel}</p>{safeLink(c.instagramUrl) && <a href={safeLink(c.instagramUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm">{c.videoCta}<ArrowUpRight className="h-4 w-4"/></a>}</div></div>}</div>
    </section>
    <section className="border-y bg-ink text-ink-foreground"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1fr_2fr] lg:px-10"><div><p className="text-xs font-bold text-primary">{c.valuesEyebrow}</p><h2 className="mt-4 text-3xl">{c.valuesTitle}</h2></div><div className="grid gap-8 md:grid-cols-3">{[{ Icon: Heart, t: c.welcomeTitle, d: c.welcomeText },{ Icon: BookOpen, t: c.wordTitle, d: c.wordText },{ Icon: Users, t: c.communityTitle, d: c.communityText }].map(({Icon,t,d}) => <div key={t}><Icon className="h-6 w-6 text-primary"/><h3 className="mt-5 text-lg">{t}</h3><p className="mt-3 text-sm leading-relaxed opacity-70">{d}</p></div>)}</div></div></section>
    {c.photos.length > 0 && <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10"><h2 className="mb-8 text-3xl">{c.galleryTitle}</h2><div className="grid gap-5 md:grid-cols-3">{c.photos.map((photo,i) => <figure key={i}><img src={photo.url} alt={photo.caption || c.name} className="aspect-[4/3] w-full object-cover" loading="lazy"/>{photo.caption && <figcaption className="mt-3 text-sm text-muted-foreground">{photo.caption}</figcaption>}</figure>)}</div></section>}
    <section className="bg-primary-soft"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-12 lg:px-10"><div><h2 className="text-3xl">{c.gatheringTitle}</h2><p className="mt-2 text-muted-foreground">{c.gatheringText}</p></div><Button asChild size="lg"><Link to="/cultos">{c.gatheringCta}<ArrowUpRight/></Link></Button></div></section>
  </SiteLayout>;
}
