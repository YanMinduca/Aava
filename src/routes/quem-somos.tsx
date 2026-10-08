import { createFileRoute } from '@tanstack/react-router';
import { SiteLayout, PageHeader } from '@/components/site/SiteLayout';
import { PageError } from '@/components/site/PageError';
import { siteQuery, siteMeta, useSiteContent } from '@/lib/site-query';
export const Route = createFileRoute('/quem-somos')({loader: ({context}) => context.queryClient.ensureQueryData(siteQuery), head: ({loaderData:c}) => siteMeta(`${c?.navAbout ?? 'Quem somos'} — ${c?.name ?? 'Comunidade Aava'}`, c?.aboutText ?? 'Conheça nossa comunidade.'), errorComponent: PageError, notFoundComponent: PageError, component: About});
function About(){ const c=useSiteContent();return <SiteLayout><PageHeader eyebrow={c.aboutEyebrow} title={c.aboutTitle} text={c.aboutText}/><section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 md:grid-cols-3 lg:px-10">{[{t:c.missionTitle,d:c.missionText},{t:c.visionTitle,d:c.visionText},{t:c.beliefsTitle,d:c.beliefsText}].map(b=><div key={b.t}><h2 className="text-2xl">{b.t}</h2><p className="mt-4 leading-relaxed text-muted-foreground">{b.d}</p></div>)}</section></SiteLayout>}
