import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Check, X, Link2, Copy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Switch } from "@/components/ui/switch";
import { inviteIsValid } from "@/lib/access-rules";
import { siteMeta } from "@/lib/site-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MemberForm, MemberAvatar, emptyMember, type MemberDraft } from "@/components/members/MemberForm";
import { APPROVAL_LABELS, MEMBER_STATUS, ageFrom, dateBR } from "@/lib/church";

export const Route = createFileRoute("/_authenticated/painel/membros")({
  head: () => siteMeta("Membros — Comunidade Aava", "Cadastros, aprovação e convites da Comunidade Aava."),
  component: MembersPage,
});

function MembersPage() {
  const { can, data: access } = useAccess();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [editing, setEditing] = useState<MemberDraft | null>(null);
  const [notes, setNotes] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("*").order("full_name");
      if (error) throw error;
      return data;
    },
  });

  async function openEdit(m: MemberDraft) {
    setEditing(m);
    setNotes("");
    if (m.id && can("view_member_notes")) {
      const { data } = await supabase.from("member_notes").select("notes").eq("member_id", m.id).maybeSingle();
      setNotes(data?.notes ?? "");
    }
  }

  const save = useMutation({
    mutationFn: async (m: MemberDraft) => {
      const { id, ...rest } = m;
      const payload = { ...rest, notes: null };
      let memberId = id;
      if (id) {
        const { error } = await supabase.from("members").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("members").insert({ ...payload, approval_status: "aprovado" }).select("id").single();
        if (error) throw error;
        memberId = data.id;
      }
      if (memberId && can("view_member_notes")) {
        await supabase.from("member_notes").upsert({ member_id: memberId, notes });
      }
    },
    onSuccess: () => {
      toast.success("Cadastro salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const setApproval = useMutation({
    mutationFn: async ({ id, approval }: { id: string; approval: string }) => {
      const { error } = await supabase.from("members").update({ approval_status: approval }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approval === "aprovado" ? "Cadastro aprovado" : "Cadastro recusado");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
    onError: (e) => toast.error(e.message),
  });

  if (!can("view_members")) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  const approved = data.filter((m) => m.approval_status !== "pendente");
  const pending = data.filter((m) => m.approval_status === "pendente");
  const filtered = approved.filter(
    (m) =>
      (statusFilter === "todos" || m.status === statusFilter) &&
      (m.full_name.toLowerCase().includes(search.toLowerCase()) || (m.cpf ?? "").includes(search)),
  );

  function exportCsv() {
    const head = ["Nome", "Nascimento", "Idade", "CPF", "RG", "Telefone", "E-mail", "Endereço", "Estado civil", "Entrada", "Filiação", "Batizado", "Data batismo", "Ministério", "Departamento", "Cargo", "Status"];
    const rows = filtered.map((m) => [m.full_name, dateBR(m.birth_date), ageFrom(m.birth_date) ?? "", m.cpf, m.rg, m.phone, m.email, m.address, m.marital_status, dateBR(m.joined_on), dateBR(m.affiliated_on), m.baptized ? "Sim" : "Não", dateBR(m.baptism_date), m.ministry, m.department, m.church_role, MEMBER_STATUS[m.status] ?? m.status]);
    const csv = [head, ...rows].map((r) => r.map((c) => String(c ?? "").replace(/[;\n]/g, " ")).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "membros.csv";
    a.click();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl text-foreground">Membros</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          {can("create_member") && (
            <Button onClick={() => openEdit({ ...emptyMember })}><Plus className="h-4 w-4" /> Novo membro</Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="lista" className="mt-6">
        <TabsList>
          <TabsTrigger value="lista">Cadastrados ({approved.length})</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes {pending.length > 0 && <Badge className="ml-2">{pending.length}</Badge>}</TabsTrigger>
          {can("invite_member") && <TabsTrigger value="convites">Convites</TabsTrigger>}
        </TabsList>

        <TabsContent value="lista">
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nome ou CPF" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {Object.entries(MEMBER_STATUS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Nome</th>
                  <th className="p-4 font-medium">Contato</th>
                  <th className="p-4 font-medium">Igreja</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={5}>Carregando...</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={5}>Nenhum membro encontrado.</td></tr>}
                {filtered.map((m) => {
                  const age = ageFrom(m.birth_date);
                  return (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <MemberAvatar path={m.photo_path} />
                          <div>
                            <p className="font-medium text-foreground">{m.full_name}</p>
                            <p className="text-xs text-muted-foreground">{age !== null ? `${age} anos` : ""}{m.baptized ? " · Batizado" : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{m.phone}<br />{m.email}</td>
                      <td className="p-4 text-muted-foreground">{[m.ministry, m.department, m.church_role].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-4">
                        <Badge variant={m.status === "membro_ativo" ? "default" : "secondary"}>{MEMBER_STATUS[m.status] ?? m.status}</Badge>
                        {m.approval_status === "recusado" && <p className="mt-1 text-xs text-destructive">Recusado</p>}
                      </td>
                      <td className="whitespace-nowrap p-4 text-right">
                        {can("edit_member") && <Button size="icon" variant="ghost" onClick={() => openEdit({ ...m })}><Pencil className="h-4 w-4" /></Button>}
                        {can("delete_member") && (
                          <Button size="icon" variant="ghost" onClick={() => confirm(`Excluir ${m.full_name}?`) && remove.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="pendentes">
          {pending.length === 0 ? (
            <p className="mt-6 text-muted-foreground">Nenhum cadastro aguardando aprovação.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {pending.map((m) => (
                <div key={m.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <MemberAvatar path={m.photo_path} size="h-12 w-12" />
                    <div>
                      <p className="font-semibold text-foreground">{m.full_name}</p>
                      <p className="text-xs text-muted-foreground">Enviado em {dateBR(m.updated_at)}</p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-muted-foreground">Telefone</dt><dd className="text-foreground">{m.phone || "—"}</dd>
                    <dt className="text-muted-foreground">E-mail</dt><dd className="truncate text-foreground">{m.email || "—"}</dd>
                    <dt className="text-muted-foreground">CPF</dt><dd className="text-foreground">{m.cpf || "—"}</dd>
                    <dt className="text-muted-foreground">Nascimento</dt><dd className="text-foreground">{dateBR(m.birth_date)}</dd>
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {can("approve_member") && (
                      <>
                        <Button size="sm" onClick={() => setApproval.mutate({ id: m.id, approval: "aprovado" })}><Check className="h-4 w-4" /> Aprovar</Button>
                        <Button size="sm" variant="outline" onClick={() => setApproval.mutate({ id: m.id, approval: "recusado" })}><X className="h-4 w-4" /> Recusar</Button>
                      </>
                    )}
                    {can("edit_member") && <Button size="sm" variant="ghost" onClick={() => openEdit({ ...m })}><Pencil className="h-4 w-4" /> Revisar</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {can("invite_member") && (
          <TabsContent value="convites">
            <Invites uid={access?.uid ?? null} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar cadastro" : "Novo membro"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="space-y-6">
              {editing.approval_status && editing.approval_status !== "aprovado" && (
                <p className="rounded-lg bg-primary-soft px-4 py-2 text-sm text-accent-foreground">{APPROVAL_LABELS[editing.approval_status]}</p>
              )}
              <MemberForm
                mode="admin"
                value={editing}
                onChange={setEditing}
                photoFolder={editing.user_id ?? "admin"}
                {...(can("view_member_notes") ? { notes, onNotesChange: setNotes } : {})}
              />
              <Button type="submit" className="w-full" disabled={save.isPending}>Salvar cadastro</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Invites({ uid }: { uid: string | null }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [unlimited, setUnlimited] = useState(true);
  const invites = useQuery({
    queryKey: ["invites"],
    queryFn: async () => (await supabase.from("member_invites").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const create = useMutation({
    mutationFn: async () => {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => chars[b % chars.length]).join("");
      const { error } = await supabase.from("member_invites").insert({ code, note: note || null, created_by: uid, unlimited });
      if (error) throw error;
      return code;
    },
    onSuccess: (code) => {
      setNote("");
      navigator.clipboard?.writeText(`${window.location.origin}/convite/${code}`);
      toast.success("Convite criado e link copiado!");
      qc.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("member_invites").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites"] }),
  });
  const link = (c: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/convite/${c}`;

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-5">
        <Input className="max-w-xs" placeholder="Para quem? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={unlimited} onCheckedChange={setUnlimited} /> Uso ilimitado</label>
        <Button onClick={() => create.mutate()} disabled={create.isPending}><Link2 className="h-4 w-4" /> Convidar membro</Button>
        <p className="w-full text-xs text-muted-foreground">{unlimited ? "Uso ilimitado · sem expiração" : "Uso único · válido por 30 dias"}</p>
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {(invites.data ?? []).length === 0 && <p className="p-5 text-sm text-muted-foreground">Nenhum convite gerado.</p>}
        {(invites.data ?? []).map((i) => {
          const valid = inviteIsValid(i);
          const expired = new Date(i.expires_at) < new Date();
          return (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-mono font-semibold text-foreground">{i.code}</p>
                <p className="text-xs text-muted-foreground">{i.note ? `${i.note} · ` : ""}{i.unlimited ? `Uso ilimitado · ${i.use_count} utilização(ões)` : i.used_at ? `Usado em ${dateBR(i.used_at)}` : expired ? "Expirado" : `Válido até ${dateBR(i.expires_at)}`}</p>
              </div>
              <div className="flex gap-1">
                {valid && (
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(link(i.code)); toast.success("Link copiado"); }}>
                    <Copy className="h-4 w-4" /> Copiar link
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => del.mutate(i.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
