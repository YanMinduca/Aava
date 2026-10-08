import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MemberForm, emptyMember, type MemberDraft } from "@/components/members/MemberForm";
import { MEMBER_STATUS } from "@/lib/church";
import { siteMeta } from '@/lib/site-query';

export const Route = createFileRoute("/_authenticated/painel/meu-cadastro")({
  head: () => siteMeta('Meu cadastro — Comunidade Aava', 'Dados pessoais e eclesiásticos do membro.'),
  validateSearch: (s: Record<string, unknown>) => ({ convite: typeof s["convite"] === "string" ? (s["convite"] as string) : undefined }),
  component: MyProfile,
});

function MyProfile() {
  const { convite } = Route.useSearch();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<MemberDraft | null>(null);

  const me = useQuery({
    queryKey: ["my-member"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error('Entre para acessar seu cadastro.');
      const uid = u.user.id;
      const { data } = await supabase.from("members").select("*").eq("user_id", uid).maybeSingle();
      return { uid, email: u.user.email ?? "", name: (u.user.user_metadata?.["full_name"] as string) ?? "", row: data };
    },
  });

  useEffect(() => {
    if (!me.data || draft) return;
    setDraft(me.data.row ? { ...me.data.row } : { ...emptyMember, full_name: me.data.name, email: me.data.email, user_id: me.data.uid });
  }, [me.data, draft]);

  const save = useMutation({
    mutationFn: async (d: MemberDraft) => {
      const { id, ...rest } = d;
      if (!me.data) throw new Error('Cadastro não carregado.');
      const payload = { ...rest, user_id: me.data.uid };
      const { error } = id
        ? await supabase.from("members").update(payload).eq("id", id)
        : await supabase.from("members").insert(payload);
      if (error) throw error;
      if (convite) await supabase.rpc("use_invite", { _code: convite });
    },
    onSuccess: () => {
      toast.success("Cadastro enviado!");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["my-member"] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!draft || !me.data) return null;
  const row = me.data?.row;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl text-foreground">Meu cadastro</h1>
      {!row && <p className="mt-2 text-muted-foreground">Preencha seus dados e envie. Um responsável da igreja vai revisar e aprovar seu cadastro.</p>}
      {row?.approval_status === "pendente" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary-soft p-4 text-sm text-accent-foreground">
          <Clock className="h-5 w-5" /> Seu cadastro foi enviado e está aguardando aprovação.
        </div>
      )}
      {row?.approval_status === "aprovado" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <span className="text-foreground">Cadastro aprovado · {MEMBER_STATUS[row.status] ?? row.status}{row.ministry ? ` · ${row.ministry}` : ""}</span>
        </div>
      )}
      {row?.approval_status === "recusado" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border p-4 text-sm text-destructive">
          <XCircle className="h-5 w-5" /> Seu cadastro precisa de ajustes. Revise os dados e envie novamente.
        </div>
      )}
      <form className="mt-6 space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
        <MemberForm mode="self" value={draft} onChange={setDraft} photoFolder={me.data.uid} />
        <Button type="submit" size="lg" disabled={save.isPending}>{row ? "Salvar alterações" : "Enviar cadastro"}</Button>
      </form>
    </div>
  );
}
