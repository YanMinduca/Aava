import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2, Link2Off, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LINK_MESSAGES, type AccountRow } from "@/components/members/MemberAccountLink";
import { MEMBER_STATUS } from "@/lib/church";
import { rankMembersForAccount } from "@/lib/account-link";

const REFRESH_KEYS = [
  "members",
  "account-links",
  "users-admin",
  "account-member",
  "unlinked-members",
  "member-activity",
];

type Target = { id: string; name: string | null; email: string | null };

/** Contas de acesso que ainda não estão ligadas a nenhum cadastro, com atalho para vincular. Só para CEO / Pastor Presidente. */
export function UnlinkedAccounts({
  accounts,
  loading,
}: {
  accounts: AccountRow[];
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [target, setTarget] = useState<Target | null>(null);

  const q = search.trim().toLowerCase();
  const list = accounts.filter(
    (a) =>
      !a.member_id &&
      (!q ||
        (a.account_name ?? "").toLowerCase().includes(q) ||
        (a.account_email ?? "").toLowerCase().includes(q)),
  );

  const candidates = useQuery({
    queryKey: ["unlinked-members"],
    enabled: !!target,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, email, phone, status")
        .is("user_id", null)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const link = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc("link_member_account", {
        _member: memberId,
        _user: target!.id,
      });
      if (error) throw new Error(error.message);
      if (data !== "ok") throw new Error(data ?? "");
    },
    onSuccess: () => {
      toast.success("Conta vinculada ao cadastro");
      for (const key of REFRESH_KEYS) qc.invalidateQueries({ queryKey: [key] });
      setTarget(null);
      setMemberSearch("");
    },
    onError: (e) =>
      toast.error(
        LINK_MESSAGES[e instanceof Error ? e.message : ""] ?? "Não foi possível vincular agora.",
      ),
  });

  const ranked = target
    ? rankMembersForAccount(
        { name: target.name, email: target.email },
        candidates.data ?? [],
        memberSearch,
      )
    : [];

  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">
        Contas que entraram no sistema mas ainda não estão ligadas a um cadastro de membro ou
        visitante.
      </p>
      <div className="relative mt-3 w-full max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome ou e-mail"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="mt-4 divide-y rounded-2xl border bg-card">
        {loading && <p className="p-5 text-sm text-muted-foreground">Carregando...</p>}
        {!loading && list.length === 0 && (
          <p className="p-5 text-sm text-muted-foreground">
            {accounts.some((a) => !a.member_id)
              ? "Nenhuma conta encontrada."
              : "Todas as contas estão vinculadas a um cadastro."}
          </p>
        )}
        {list.map((a) => (
          <div
            key={a.account_id}
            className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{a.account_name || "Sem nome"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.account_email || "Sem e-mail"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                <Link2Off className="h-3 w-3" /> Sem cadastro
              </Badge>
              <Button
                size="sm"
                onClick={() =>
                  setTarget({ id: a.account_id, name: a.account_name, email: a.account_email })
                }
              >
                <Link2 className="h-4 w-4" /> Vincular a um cadastro
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={!!target}
        onOpenChange={(o) => {
          if (!o) {
            setTarget(null);
            setMemberSearch("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Vincular {target?.name || target?.email || "conta"} a um cadastro
            </DialogTitle>
            <DialogDescription>
              Escolha o cadastro que pertence a esta pessoa. Só aparecem cadastros que ainda não têm
              conta.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, e-mail ou telefone"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {candidates.isLoading && (
              <p className="p-4 text-sm text-muted-foreground">Carregando cadastros...</p>
            )}
            {candidates.isError && (
              <p className="p-4 text-sm text-destructive">
                Não foi possível carregar os cadastros.
              </p>
            )}
            {!candidates.isLoading && !candidates.isError && ranked.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Nenhum cadastro sem conta encontrado.
              </p>
            )}
            {ranked.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {m.full_name} {m.suggested && <Badge className="ml-1">Sugestão</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[MEMBER_STATUS[m.status] ?? m.status, m.email, m.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button size="sm" disabled={link.isPending} onClick={() => link.mutate(m.id)}>
                  Vincular
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
