import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Link2, Link2Off, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LINK_MESSAGES } from "@/components/members/MemberAccountLink";
import { MEMBER_STATUS } from "@/lib/church";
import { rankMembersForAccount } from "@/lib/account-link";

type AccountUser = { id: string; name: string | null; email: string | null };

const REFRESH_KEYS = ["members", "account-links", "users-admin", "account-member", "unlinked-members", "member-activity"];

/**
 * Em Usuários e permissões: mostra se a conta está ligada a um cadastro de membro (ou visitante)
 * e, para quem pode, liga ou desliga dali mesmo. `canView` = pode ver cadastros; `canLink` = CEO / Pastor Presidente.
 */
export function AccountMemberSection({ user, canView, canLink }: { user: AccountUser; canView: boolean; canLink: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const linked = useQuery({
    queryKey: ["account-member", user.id],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, full_name, status").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const candidates = useQuery({
    queryKey: ["unlinked-members"],
    enabled: canView && canLink && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, full_name, email, phone, status").is("user_id", null).order("full_name");
      if (error) throw error;
      return data;
    },
  });

  function refresh() {
    for (const key of REFRESH_KEYS) qc.invalidateQueries({ queryKey: [key] });
  }

  const link = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc("link_member_account", { _member: memberId, _user: user.id });
      if (error) throw new Error(error.message);
      if (data !== "ok") throw new Error(data ?? "");
    },
    onSuccess: () => {
      toast.success("Conta vinculada ao cadastro");
      refresh();
      setOpen(false);
      setSearch("");
    },
    onError: (e) => toast.error(LINK_MESSAGES[e instanceof Error ? e.message : ""] ?? "Não foi possível vincular agora."),
  });

  const unlink = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc("unlink_member_account", { _member: memberId });
      if (error) throw new Error(error.message);
      if (data !== "ok") throw new Error(data ?? "");
    },
    onSuccess: () => {
      toast.success("Conta desvinculada do cadastro");
      refresh();
    },
    onError: (e) => toast.error(LINK_MESSAGES[e instanceof Error ? e.message : ""] ?? "Não foi possível desvincular agora."),
  });

  if (!canView) return null;

  const member = linked.data;
  const ranked = rankMembersForAccount({ name: user.name, email: user.email }, candidates.data ?? [], search);

  return (
    <section className="mt-4 rounded-xl border bg-muted/30 p-4" aria-label="Cadastro de membro" data-testid="account-member-section">
      <p className="text-sm font-medium text-foreground">Cadastro de membro</p>

      {linked.isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Verificando vínculo...</p>
      ) : linked.isError ? (
        <p className="mt-2 text-sm text-destructive">Não foi possível verificar o vínculo desta conta.</p>
      ) : member ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Conta <strong className="text-foreground">vinculada</strong> ao cadastro de{" "}
            <Link to="/painel/membro/$id" params={{ id: member.id }} className="font-medium text-primary hover:underline">{member.full_name}</Link>{" "}
            <Badge variant="secondary" className="ml-1">{MEMBER_STATUS[member.status] ?? member.status}</Badge>
          </div>
          {canLink && (
            <Button
              size="sm"
              variant="outline"
              disabled={unlink.isPending}
              onClick={() => {
                if (window.confirm(`Desvincular esta conta do cadastro de ${member.full_name}? O cadastro e a conta continuam existindo.`)) unlink.mutate(member.id);
              }}
            >
              <Link2Off className="h-4 w-4" /> Desvincular
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Esta conta <strong className="text-foreground">não está vinculada</strong> a nenhum cadastro de membro.
            {!canLink && " Somente o CEO e o Pastor Presidente podem vincular."}
          </p>
          {canLink && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Link2 className="h-4 w-4" /> Vincular a um cadastro
            </Button>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular {user.name || user.email || "conta"} a um cadastro</DialogTitle>
            <DialogDescription>Escolha o cadastro que pertence a esta pessoa. Só aparecem cadastros que ainda não têm conta.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome, e-mail ou telefone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {candidates.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando cadastros...</p>}
            {candidates.isError && <p className="p-4 text-sm text-destructive">Não foi possível carregar os cadastros.</p>}
            {!candidates.isLoading && !candidates.isError && ranked.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum cadastro sem conta encontrado.</p>}
            {ranked.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {m.full_name} {m.suggested && <Badge className="ml-1">Sugestão</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{[MEMBER_STATUS[m.status] ?? m.status, m.email, m.phone].filter(Boolean).join(" · ")}</p>
                </div>
                <Button size="sm" disabled={link.isPending} onClick={() => link.mutate(m.id)}>Vincular</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
