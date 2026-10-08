import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ArrowUpRight, MapPin, Instagram } from 'lucide-react';
import { useSiteContent } from '@/lib/site-query';
import { safeLink } from '@/lib/site-content';
import { Button } from '@/components/ui/button';

export function SiteLayout({ children }: { children: ReactNode }) {
  const c = useSiteContent();
  const nav = [{ to: '/', label: c.navHome }, { to: '/quem-somos', label: c.navAbout }, { to: '/cultos', label: c.navServices }, { to: '/oracao', label: c.navPrayer }, { to: '/contribuicao', label: c.navContribution }, { to: '/contato', label: c.navContact }] as const;
  return <div className="flex min-h-screen flex-col">
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 lg:px-10">
        <Link to="/" className="max-w-64 font-display text-xl font-extrabold text-foreground">{c.name}<span className="text-primary">.</span></Link>
        <nav className="order-3 flex w-full gap-5 overflow-x-auto pb-1 text-xs lg:order-none lg:w-auto lg:text-sm">{nav.map(n => <Link key={n.to} to={n.to} className="shrink-0 text-muted-foreground hover:text-primary" activeOptions={{ exact: true }} activeProps={{ className: 'text-primary font-semibold' }}>{n.label}</Link>)}</nav>
        <Button asChild variant="outline"><Link to="/painel">{c.navPanel}<ArrowUpRight /></Link></Button>
      </div>
    </header>
    <main className="flex-1">{children}</main>
    <footer className="bg-ink text-ink-foreground"><div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-2 lg:px-10"><div><p className="text-2xl font-bold">{c.name}<span className="text-primary">.</span></p><p className="mt-3 text-sm opacity-70">{c.tagline}</p>{safeLink(c.instagramUrl) && <Button asChild variant="ghost" className="mt-4"><a href={safeLink(c.instagramUrl)} target="_blank" rel="noreferrer"><Instagram />Instagram</a></Button>}</div><div className="flex items-start gap-3 md:justify-end"><MapPin className="h-5 w-5 shrink-0 text-primary"/><div className="text-sm"><p>{c.address}</p><p className="mt-2 opacity-70">{c.city}</p>{c.phone && <p className="mt-3">{c.phone}</p>}{c.email && <p>{c.email}</p>}</div></div></div></footer>
  </div>;
}
export function PageHeader({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return <section className="border-b bg-primary-soft"><div className="mx-auto max-w-7xl px-5 py-16 lg:px-10"><p className="text-xs font-bold text-primary">{eyebrow}</p><h1 className="mt-4 text-4xl md:text-5xl">{title}</h1>{text && <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">{text}</p>}</div></section>;
}
