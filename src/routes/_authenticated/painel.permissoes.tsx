import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { PERMISSION_GROUPS, ROLE_LABELS } from "@/lib/church";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { siteMeta } from "@/lib/site-query";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel/permissoes")({
  head: () => siteMeta("Usuários e permissões — Comunidade Aava", "Gerencie os cargos e acessos da Comunidade Aava."),
  component: PermissionsPage,
});

const ADMIN_DEFAULTS = ["view_members", "create_member", "edit_member"];

function PermissionsPage() {
  const { isCeo, isFullAccess, can, data: access } = useAccess();
  const uid = access?.uid;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [p, r, perms] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("*"),
        supabase.from("user_permissions").select("*"),
      ]);
      return (p.data ?? []).map((u) => ({
        ...u,
        role: (r.data ?? []).find((x) => x.user_id === u.id)?.role ?? "member",
        perms: (perms.data ?? []).filter((x) => x.user_id === u.id).map((x) => x.permission),
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.rpc("assign_church_role", { _user_id: userId, _role: role as Database["public"]["Enums"]["app_role"] });
      if (error) throw error;
      if (role === "admin") {
        const cur = users.data?.find((u) => u.id === userId)?.perms ?? [];
        const add = ADMIN_DEFAULTS.filter((p) => !cur.includes(p)).map((permission) => ({ user_id: userId, permission }));
        if (add.length) await supabase.from("user_permissions").insert(add);
      }
    },
    onSuccess: () => { toast.success("Função atualizada"); qc.invalidateQueries({ queryKey: ["users-admin"] }); qc.invalidateQueries({ queryKey: ["access"] }); },
    onError: (e) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ userId, perm, on }: { userId: string; perm: string; on: boolean }) => {
      const { error } = on
        ? await supabase.from("user_permissions").insert({ user_id: userId, permission: perm })
        : await supabase.from("user_permissions").delete().eq("user_id", userId).eq("permission", perm);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-admin"] }),
    onError: (e) => toast.error(e.message),
  });

  if (!isCeo && !can("manage_permissions")) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  const list = users.data ?? [];
  const current = list.find((u) => u.id === selected);

  return (
    <div>
      <h1 className="text-3xl text-foreground">Usuários e permissões</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Quem cria uma conta entra como Membro. Defina a função de cada pessoa e libere permissões individualmente — por exemplo, dar acesso ao financeiro a um administrador específico.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="divide-y rounded-2xl border bg-card">
          {list.map((u) => (
            <Button variant="ghost" key={u.id} onClick={() => setSelected(u.id)} className={`flex h-auto w-full items-center justify-between gap-3 rounded-none p-4 text-left transition-colors hover:bg-accent ${selected === u.id ? "bg-accent" : ""}`}>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{u.full_name || u.email}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <span className="shrink-0 text-xs text-primary">{ROLE_LABELS[u.role]}</span>
            </Button>
          ))}
        </div>

        {current ? (
          <div className="rounded-2xl border bg-card p-6">
            <p className="font-display text-xl text-foreground">{current.full_name || current.email}</p>
            {current.role === "ceo" ? (
              <p className="mt-3 text-sm text-muted-foreground">O CEO tem acesso total ao sistema.</p>
            ) : (
              <>
                <div className="mt-4 max-w-xs">
                  <Select disabled={!isFullAccess || current.id === uid || (!isCeo && current.role === "pastor_presidente")} value={current.role} onValueChange={(role) => setRole.mutate({ userId: current.id, role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[...(isCeo || current.role === "pastor_presidente" ? ["pastor_presidente"] : []), "admin", "leader", "volunteer", "member"].map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {current.role === "pastor_presidente" && <p className="mt-4 text-sm text-primary">O Pastor Presidente tem acesso total, assim como o CEO. Somente o CEO pode atribuir este cargo.</p>}
                <div className="mt-6 space-y-6">
                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.label}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
                      <div className="mt-2 space-y-2">
                        {g.perms.map((p) => (
                          <label key={p.key} className="flex items-center justify-between gap-4 rounded-lg border px-4 py-2.5 text-sm">
                            <span className="text-foreground">{p.label}</span>
                            <Switch
                              disabled={!isFullAccess || current.role === "pastor_presidente"}
                              checked={current.role === "pastor_presidente" || current.perms.includes(p.key)}
                              onCheckedChange={(on) => toggle.mutate({ userId: current.id, perm: p.key, on })}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">Selecione um usuário para editar.</div>
        )}
      </div>
    </div>
  );
}
