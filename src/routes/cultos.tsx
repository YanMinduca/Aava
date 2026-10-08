import { createFileRoute } from '@tanstack/react-router';
import { SiteLayout, PageHeader } from '@/components/site/SiteLayout';
import { PageError } from '@/components/site/PageError';
import { siteQuery, siteMeta, useSiteContent } from '@/lib/site-query';
export const Route = createFileRoute('/cultos')({loader: ({context}) => context.queryClient.ensureQueryData(siteQuery), head: ({loaderData:c}) => siteMeta(`${c?.navServices ?? 'Cultos'} — ${c?.name ?? 'Comunidade Aava'}`, c?.servicesText || 'Horários dos cultos e encontros da comunidade.'), errorComponent: PageError, notFoundComponent: PageError, component: Services});
function Services(){const c=useSiteContent();return <SiteLayout><PageHeader eyebrow={c.servicesEyebrow} title={c.servicesTitle} text={c.servicesText}/><section className="mx-auto max-w-3xl px-5 py-16"><ul className="divide-y">{c.schedule.map((s,i)=><li key={i} className="flex items-center justify-between gap-4 py-6"><div><p className="text-sm text-muted-foreground">{s.day}</p><p className="mt-2 text-xl font-semibold">{s.name}</p></div><span className="shrink-0 text-xl font-bold text-primary">{s.time}</span></li>)}</ul></section></SiteLayout>}
