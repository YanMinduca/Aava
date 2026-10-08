import { createFileRoute, Link } from '@tanstack/react-router';
import { SiteLayout, PageHeader } from '@/components/site/SiteLayout';
import { PageError } from '@/components/site/PageError';
import { PrayerRequests } from '@/components/prayers/PrayerRequests';
import { useAccess } from '@/hooks/use-access';
import { Button } from '@/components/ui/button';
import { siteQuery, siteMeta, useSiteContent } from '@/lib/site-query';
export const Route=createFileRoute('/oracao')({loader:({context})=>context.queryClient.ensureQueryData(siteQuery),head:({loaderData:c})=>siteMeta(`${c?.prayerTitle ?? 'Pedidos de oração'} — ${c?.name ?? 'Comunidade Aava'}`,c?.prayerText ?? 'Envie seu pedido de oração.'),errorComponent:PageError,notFoundComponent:PageError,component:PrayerPage});
function PrayerPage(){const c=useSiteContent();const {data:access,isLoading}=useAccess();return <SiteLayout><PageHeader eyebrow={c.prayerEyebrow} title={c.prayerTitle} text={c.prayerText}/><section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">{!isLoading&&!access?.uid?<div><p className="mb-5 text-muted-foreground">{c.prayerPrivacy}</p><Button asChild><Link to="/auth" search={{next:'/oracao'}}>Entrar para pedir oração</Link></Button></div>:<PrayerRequests cta={c.prayerCta} privacy={c.prayerPrivacy}/>}</section></SiteLayout>}