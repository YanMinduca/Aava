import { createFileRoute } from '@tanstack/react-router';
import { PrayerRequests } from '@/components/prayers/PrayerRequests';
import { siteMeta } from '@/lib/site-query';
export const Route=createFileRoute('/_authenticated/painel/oracao')({head:()=>siteMeta('Pedidos de oração — Área de membros Aava','Envie e acompanhe pedidos de oração da comunidade.'),component:PanelPrayer});
function PanelPrayer(){return <div><h1 className="mb-8 text-3xl">Pedidos de oração</h1><PrayerRequests/></div>}