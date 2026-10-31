import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Link2Off, Search, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type AccountRow = { account_id: string; account_name: string | null; account_email: string | null; member_id: string | null };

export const LINK_MESSAGES: Record<string, string> = {
  member_not_found: "Este cadastro não existe mais.",
  member_already_linked: "Este cadastro já tem uma conta vinculada.",
  user_not_found: "Esta conta não existe mais.",
  user_already_linked: "Esta conta já está vinculada a outro cadastro (por exemplo, um cadastro de visitante de evento).",
  "Acesso negado": "Somente o CEO e o Pastor Presidente podem vincular contas.",
};

/** Contas de acesso e a que cadastro cada uma está ligada. Só carrega para quem tem acesso total. */
export function useAccountLinks(enabled: boolean) {
  return useQuery({
    queryKey: ["account-links"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_accounts_for_linking");
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });
}

/** Selo "Com conta" / "Sem conta" para a lista de membros. */
export function AccountBadge({ linked, email }: { linked: boolean; email?: string | null }) {
  return linked ? (
    <div>
      <Badge variant="outline" className="gap-1 border-primary/40 text-primary"><UserCheck className="h-3 w-3" /> Com conta</Badge>
      {email && <p className="mt-1 max-w-44 truncate text-xs text-muted-foreground" title={email}>{email}</p>}
    </div>
  ) : (
    <Badge variant="secondary" className="gap-1 text-muted-foreground"><Link2Off className="h-3 w-3" /> Sem conta</Badge>
  );
}

/** Janela para o CEO escolher a conta que será ligada a um cadastro já existente (ou soltar a conta atual). */
export function LinkAccountDialog({
  member,
  accounts,
  onClose,
}: {
  member: { id: string; full_name: string; user_id: string | null } | null;
  accounts: AccountRow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const refresh = () => {
    for (const key of ["members", "account-links", "users-admin"]) qc.invalidateQueries({ queryKey: [key] });
  };

  const link = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.rpc("link_member_account", { _member: member!.id, _user: userId });
      if (error) throw new Error(error.message);
      if (data !== "ok") throw new Error(data ?? "");
    },
    onSuccess: () => { toast.success("Conta vinculada ao cadastro"); refresh(); setSearch(""); onClose(); },
    onError: (e) => toast.error(LINK_MESSAGES[e instanceof Error ? e.message : ""] ?? "Não foi possível vincular agora."),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("unlink_member_account", { _member: member!.id });
      if (error) throw new Error(error.message);
      if (data !== "ok") throw new Error(data ?? "");
    },
    onSuccess: () => { toast.success("Conta desvinculada do cadastro"); refresh(); onClose(); },
    onError: (e) => toast.error(LINK_MESSAGES[e instanceof Error ? e.message : ""] ?? "Não foi possível desvincular agora."),
  });

  const current = member?.user_id ? accounts.find((a) => a.account_id === member.user_id) : undefined;
  const q = search.trim().toLowerCase();
  const free = accounts
    .filter((a) => !a.member_id)
    .filter((a) => !q || (a.account_name ?? "").toLowerCase().includes(q) || (a.account_email ?? "").toLowerCase().includes(q));

  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) { setSearch(""); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{member?.user_id ? "Conta vinculada" : "Vincular conta ao cadastro"}</DialogTitle>
          <DialogDescription>{member?.full_name}</DialogDescription>
        </DialogHeader>

        {member?.user_id ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">{current?.account_name || "Conta sem nome"}</p>
              <p className="text-muted-foreground">{current?.account_email ?? "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">Desvincular não apaga a conta nem o cadastro: eles só deixam de estar ligados. Depois você pode vincular outra conta.</p>
            <Button variant="outline" disabled={unlink.isPending} onClick={() => confirm(`Desvincular a conta de ${member.full_name}?`) && unlink.mutate()}>
              <Link2Off className="h-4 w-4" /> Desvincular conta
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Escolha a conta de acesso (login) desta pessoa. Só aparecem contas que ainda não estão ligadas a nenhum cadastro.</p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar conta por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="max-h-72 divide-y overflow-y-auto rounded-xl border">
              {free.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma conta disponível para vincular.</p>}
              {free.map((a) => (
                <div key={a.account_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{a.account_name || "Conta sem nome"}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.account_email ?? "—"}</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={link.isPending}
                    onClick={() => confirm(`Vincular a conta ${a.account_email ?? a.account_name} ao cadastro de ${member?.full_name}?`) && link.mutate(a.account_id)}
                  >
                    <Link2 className="h-4 w-4" /> Vincular
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
