import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronDown, Mail, UserPlus, UserRoundCheck, UserRoundPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { isVisitor } from "@/lib/visitors";

const STORAGE_KEY = "aava:membros:atividade-aberta";

/** Lembra se a pessoa deixou a atividade aberta. Começa fechada, para a página de membros ficar limpa. */
function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveOpen(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  } catch {
    // sem armazenamento (modo privado etc.): só não lembra da escolha
  }
}

/** Novos cadastros, contas criadas e vínculos. Fica recolhido até a pessoa abrir. */
export function RecentActivity({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(readOpen);

  const activity = useQuery({
    queryKey: ["member-activity"],
    enabled,
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("member_activity")
        .select("id, kind, member_id, user_id, created_at, account_name, account_email")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;

      const memberIds = [...new Set(events.map((event) => event.member_id).filter((id): id is string => !!id))];
      const people = new Map<string, { name: string; visitor: boolean }>();
      if (memberIds.length) {
        const { data: rows, error: membersError } = await supabase.from("members").select("id, full_name, status").in("id", memberIds);
        if (membersError) throw membersError;
        for (const m of rows ?? []) people.set(m.id, { name: m.full_name, visitor: isVisitor(m) });
      }

      return events.map((event) => {
        const person = event.member_id ? people.get(event.member_id) : undefined;
        return { ...event, member_name: person?.name ?? null, member_is_visitor: person?.visitor ?? false };
      });
    },
  });

  const list = activity.data ?? [];

  function toggle(next: boolean) {
    setOpen(next);
    saveOpen(next);
  }

  return (
    <Collapsible open={open} onOpenChange={toggle} className="mt-6 rounded-2xl border bg-card" data-testid="recent-activity">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-5 py-3 text-left transition-colors hover:bg-accent/40">
        <span className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Activity className="h-5 w-5 text-primary" /> Atividade recente
        </span>
        <span className="flex items-center gap-3">
          <span className="rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            {activity.isLoading ? "…" : `${list.length} ${list.length === 1 ? "atividade" : "atividades"}`}
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Minimizar" : "Mostrar"}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t px-5 pb-5 pt-4">
        <p className="text-sm text-muted-foreground">Novos cadastros, criação de contas e vínculos com membros.</p>

        {activity.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Carregando atividades...</p>
        ) : activity.isError ? (
          <p className="mt-4 text-sm text-destructive">Não foi possível carregar as atividades recentes.</p>
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
        ) : (
          <ol className="mt-4 max-h-80 divide-y overflow-y-auto pr-1">
            {list.map((event) => {
              const name = event.member_name ?? event.account_name ?? "Membro";
              const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(event.created_at));
              const isAccount = event.kind === "account_created";
              const isLinked = event.kind === "account_linked";
              const visitor = event.member_is_visitor;
              const title = isAccount
                ? `Nova conta criada por ${event.account_name ?? "novo usuário"}`
                : isLinked
                  ? `Nova conta vinculada para ${name}`
                  : `${visitor ? "Novo visitante cadastrado" : "Novo membro cadastrado"}: ${name}`;
              const Icon = isAccount ? UserPlus : isLinked ? Mail : visitor ? UserRoundPlus : UserRoundCheck;
              const badge = isAccount ? "Conta" : isLinked ? "Vínculo" : visitor ? "Visitante" : "Cadastro";

              return (
                <li key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    {event.account_email && <p className="mt-0.5 break-all text-xs text-muted-foreground">{event.account_email}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{when}</p>
                  </div>
                  <Badge variant="outline">{badge}</Badge>
                </li>
              );
            })}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
