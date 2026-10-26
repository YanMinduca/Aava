import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  Wallet,
  HandCoins,
  ShieldCheck,
  LogOut,
  Globe,
  UserCircle,
  Heart,
  Settings,
  Network,
  CalendarDays,
  Bell,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { useDeptAccess } from "@/hooks/use-departments";
import { ROLE_LABELS } from "@/lib/church";
import { purgeStorageTrash } from "@/lib/storage-trash";
import { forgetPushDevice, syncPush } from "@/lib/push";
import { PushPrompt } from "@/components/push/PushPrompt";
import { InstallPrompt } from "@/components/pwa/InstallApp";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [{ title: "Painel — Comunidade Aava" }, { name: "robots", content: "noindex" }],
  }),
  component: PanelLayout,
});

function PanelLayout() {
  const { can, isFullAccess, roles, email } = useAccess();
  const { canViewPage: canViewDepartments } = useDeptAccess();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Arquivos de coisas apagadas (comprovantes, fotos trocadas...) saem de verdade do armazenamento
  useEffect(() => {
    void purgeStorageTrash();
    const t = setInterval(() => void purgeStorageTrash(), 3 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Mostra "Escalas" no menu só para quem participa de algum departamento (voluntário, líder ou liderança)
  const shiftDepts = useQuery({
    queryKey: ["shift-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shift_departments");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Aparelho que já aceitou notificações: renova o registro (e passa para quem está logado agora)
  useEffect(() => {
    void syncPush().catch(() => undefined);
  }, []);

  const items = [
    { to: "/painel", label: "Visão geral", icon: LayoutDashboard, show: true },
    { to: "/painel/meu-cadastro", label: "Meu cadastro", icon: UserCircle, show: true },
    {
      to: "/painel/oracao",
      label: "Pedidos de oração",
      icon: Heart,
      show: can("view_prayer_requests"),
    },
    { to: "/painel/membros", label: "Membros", icon: Users, show: can("view_members") },
    { to: "/painel/departamentos", label: "Departamentos", icon: Network, show: canViewDepartments },
    { to: "/painel/eventos", label: "Eventos", icon: CalendarDays, show: can("manage_events") || can("verify_event_payments") || can("checkin_events") },
    { to: "/painel/financeiro", label: "Financeiro", icon: Wallet, show: can("view_finance") },
    {
      to: "/painel/permissoes",
      label: "Usuários e permissões",
      icon: ShieldCheck,
      show: isFullAccess || can("manage_permissions"),
    },
    { to: "/painel/escalas", label: "Escalas", icon: CalendarClock, show: (shiftDepts.data?.length ?? 0) > 0 },
    { to: "/painel/notificacoes", label: "Avisos (notificações)", icon: Bell, show: can("send_push") },
    { to: "/painel/site", label: "Editar site", icon: Settings, show: isFullAccess },
  ] as const;

  async function signOut() {
    await qc.cancelQueries();
    // Antes de sair: este aparelho deixa de receber os avisos desta conta
    await forgetPushDevice().catch(() => undefined);
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-secondary/40 md:flex print:bg-background">
      <aside className="print:hidden border-b bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col p-5">
          <Link to="/" className="font-display text-lg text-foreground">
            Comunidade <span className="text-primary">Aava</span>
          </Link>
          <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
            {items
              .filter((i) => i.show)
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: true }}
                  className="flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  activeProps={{
                    className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
          </nav>
          <div className="mt-auto hidden space-y-3 pt-6 text-sm md:block">
            <div>
              <p className="truncate text-foreground">{email}</p>
              <p className="text-xs text-muted-foreground">
                {roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Globe className="h-4 w-4" /> Ver site
            </Link>
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-10">
        <InstallPrompt />
        <PushPrompt />
        <Outlet />
        <button
          onClick={signOut}
          className="mt-10 flex items-center gap-2 text-sm text-muted-foreground md:hidden"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </main>
    </div>
  );
}
