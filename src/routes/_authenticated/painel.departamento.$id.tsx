import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Crown, Download, Pencil, Plus, Printer, Trash2, UserMinus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useChurchRoles, useDeptAccess, useDepartments } from "@/hooks/use-departments";
import { dateBR, MEMBER_STATUS } from "@/lib/church";
import { downloadSheets } from "@/lib/export";
import { siteMeta } from "@/lib/site-query";
import { MemberAvatar } from "@/components/members/MemberForm";
import { MemberCombobox } from "@/components/members/MemberCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel/departamento/$id")({
  head: () => siteMeta("Departamento — Comunidade Aava", "Voluntários, liderança e relatório do departamento."),
  component: DepartmentDetail,
});

function DepartmentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { canIn, manageAll, isLoading: loadingAccess } = useDeptAccess();
  const departments = useDepartments();
  const roles = useChurchRoles();
  const dept = departments.data?.find((d) => d.id === id);

  const canView = canIn(id, "dept_view");
  const canManageMembers = canIn(id, "dept_manage_members");
  const canReport = canIn(id, "dept_report");

  const roster = useQuery({
    queryKey: ["department-roster", id],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("department_roster", { _dept: id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["department-roster", id] });
    qc.invalidateQueries({ queryKey: ["departments"] });
    qc.invalidateQueries({ queryKey: ["member-departments"] });
    qc.invalidateQueries({ queryKey: ["my-dept-roles"] });
  };

  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const candidates = useQuery({
    queryKey: ["department-candidates", id],
    enabled: adding && canManageMembers,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("department_candidates", { _dept: id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("department_members").insert({ department_id: id, member_id: candidate });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Voluntário adicionado");
      setAdding(false);
      setCandidate("");
      qc.invalidateQueries({ queryKey: ["department-candidates", id] });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ memberId, roleId }: { memberId: string; roleId: string | null }) => {
      const { error } = await supabase.rpc("set_member_church_role", { _member: memberId, _role: roleId as string });
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("department_members").delete().eq("department_id", id).eq("member_id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Voluntário removido do departamento");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLeader = useMutation({
    mutationFn: async (memberId: string | null) => {
      const { error } = await supabase.from("departments").update({ leader_member_id: memberId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Liderança atualizada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveDept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("departments")
        .update({ name: form.name.trim(), description: form.description.trim() || null })
        .eq("id", id);
      if (error) throw new Error(error.code === "23505" ? "Já existe um departamento com esse nome." : error.message);
    },
    onSuccess: () => {
      toast.success("Departamento atualizado");
      setEditing(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Departamento excluído");
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["member-departments"] });
      navigate({ to: "/painel/departamentos" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingAccess || departments.isLoading) return null;
  const back = (
    <Link to="/painel/departamentos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Voltar para departamentos
    </Link>
  );
  if (!dept) return <div className="space-y-4">{back}<p className="text-muted-foreground">Departamento não encontrado ou sem acesso.</p></div>;

  const rows = roster.data ?? [];
  const byRole = rows.reduce<Record<string, number>>((acc, r) => {
    const k = r.role_name ?? "Sem cargo";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  function exportReport() {
    const today = new Date().toLocaleDateString("pt-BR");
    downloadSheets(`departamento-${dept!.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`, [
      {
        name: "Resumo",
        rows: [
          ["Departamento", dept!.name],
          ["Líder", dept!.leader_name ?? "—"],
          ["Total de voluntários", rows.length],
          ["Gerado em", today],
          [],
          ["Cargo", "Quantidade"],
          ...Object.entries(byRole).map(([k, v]) => [k, v]),
        ],
      },
      {
        name: "Voluntários",
        rows: [
          ["Nome", "Cargo", "Líder", "Telefone", "E-mail", "Status", "No departamento desde"],
          ...rows.map((r) => [r.full_name, r.role_name ?? "", r.is_leader ? "Sim" : "", r.phone, r.email, MEMBER_STATUS[r.status] ?? r.status, dateBR(r.joined_at)]),
        ],
      },
    ]);
  }

  return (
    <div>
      <div className="print:hidden">{back}</div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl text-foreground">{dept.name}</h1>
          {dept.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{dept.description}</p>}
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-foreground">
            <Crown className="h-4 w-4 text-primary" /> Líder: {dept.leader_name ?? "não definido"}
          </p>
        </div>
        {manageAll && (
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => { setForm({ name: dept.name, description: dept.description ?? "" }); setEditing(true); }}><Pencil className="h-4 w-4" /> Editar</Button>
            <Button variant="outline" onClick={() => confirm(`Excluir o departamento ${dept.name}? Os vínculos dos voluntários com ele serão removidos.`) && deleteDept.mutate()}><Trash2 className="h-4 w-4" /> Excluir</Button>
          </div>
        )}
      </div>

      {!canView ? (
        <p className="mt-8 text-muted-foreground">Você faz parte deste departamento, mas ainda não tem permissão para ver os voluntários. Peça ao Pastor Presidente ou ao CEO para liberar o acesso.</p>
      ) : (
        <Tabs defaultValue="voluntarios" className="mt-6">
          <TabsList className="print:hidden">
            <TabsTrigger value="voluntarios">Voluntários ({rows.length})</TabsTrigger>
            {canReport && <TabsTrigger value="relatorio">Relatório</TabsTrigger>}
          </TabsList>

          <TabsContent value="voluntarios">
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {manageAll ? (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Líder do departamento</Label>
                  <div className="w-64">
                    <MemberCombobox
                      options={rows.map((r) => ({ id: r.member_id, label: r.full_name }))}
                      value={dept.leader_member_id ?? ""}
                      onChange={(v) => setLeader.mutate(v || null)}
                      placeholder="Escolher líder"
                    />
                  </div>
                  {dept.leader_member_id && <Button size="sm" variant="ghost" onClick={() => setLeader.mutate(null)}>Remover líder</Button>}
                </div>
              ) : <span />}
              {canManageMembers && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Adicionar voluntário</Button>}
            </div>
            {manageAll && rows.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Adicione voluntários primeiro; o líder é escolhido entre eles.</p>}

            <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Nome</th>
                    <th className="p-4 font-medium">Contato</th>
                    <th className="p-4 font-medium">Cargo</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody>
                  {roster.isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={4}>Carregando...</td></tr>}
                  {!roster.isLoading && rows.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>Nenhum voluntário neste departamento.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.member_id} className="border-b last:border-0">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <MemberAvatar path={r.photo_path} />
                          <div>
                            <p className="font-medium text-foreground">{r.full_name}</p>
                            {r.is_leader && <Badge className="mt-1"><Crown className="mr-1 h-3 w-3" /> Líder</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">{r.phone}<br />{r.email}</td>
                      <td className="p-4">
                        {manageAll ? (
                          <Select value={r.church_role_id ?? "none"} onValueChange={(roleId) => changeRole.mutate({ memberId: r.member_id, roleId: roleId === "none" ? null : roleId })}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="Sem cargo" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem cargo</SelectItem>
                              {(roles.data ?? []).map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-foreground">{r.role_name ?? "—"}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap p-4 text-right">
                        {canManageMembers && (
                          <Button size="icon" variant="ghost" aria-label="Remover do departamento" onClick={() => confirm(`Remover ${r.full_name} do departamento?`) && removeMember.mutate(r.member_id)}><UserMinus className="h-4 w-4" /></Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {canReport && (
            <TabsContent value="relatorio">
              <div className="mt-4 flex flex-wrap justify-end gap-2 print:hidden">
                <Button variant="outline" onClick={exportReport}><Download className="h-4 w-4" /> XLS</Button>
                <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border bg-card p-5"><p className="text-xs text-muted-foreground">Total de voluntários</p><p className="mt-1 text-2xl font-semibold text-foreground">{rows.length}</p></div>
                <div className="rounded-2xl border bg-card p-5"><p className="text-xs text-muted-foreground">Líder</p><p className="mt-1 text-lg font-semibold text-foreground">{dept.leader_name ?? "—"}</p></div>
                <div className="rounded-2xl border bg-card p-5"><p className="text-xs text-muted-foreground">Gerado em</p><p className="mt-1 text-lg font-semibold text-foreground">{new Date().toLocaleDateString("pt-BR")}</p></div>
              </div>
              <div className="mt-4 rounded-2xl border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">Por cargo</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(byRole).map(([k, v]) => <Badge key={k} variant="secondary">{k}: {v}</Badge>)}
                  {rows.length === 0 && <span className="text-sm text-muted-foreground">Sem voluntários.</span>}
                </div>
              </div>
              <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-muted-foreground">
                    <tr><th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Cargo</th><th className="p-4 font-medium">Telefone</th><th className="p-4 font-medium">Status</th><th className="p-4 font-medium">Desde</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.member_id} className="border-b last:border-0">
                        <td className="p-4 text-foreground">{r.full_name}{r.is_leader ? " (líder)" : ""}</td>
                        <td className="p-4 text-muted-foreground">{r.role_name ?? "—"}</td>
                        <td className="p-4 text-muted-foreground">{r.phone || "—"}</td>
                        <td className="p-4 text-muted-foreground">{MEMBER_STATUS[r.status] ?? r.status}</td>
                        <td className="p-4 text-muted-foreground">{dateBR(r.joined_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar voluntário</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (candidate) addMember.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Membro</Label>
              <MemberCombobox
                options={(candidates.data ?? []).map((c) => ({ id: c.id, label: c.full_name }))}
                value={candidate}
                onChange={setCandidate}
                loading={candidates.isLoading}
              />
              {!candidates.isLoading && (candidates.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Todos os membros aprovados já estão neste departamento.</p>}
              <p className="text-xs text-muted-foreground">O cargo é definido no cadastro do membro.</p>
            </div>
            <Button type="submit" className="w-full" disabled={!candidate || addMember.isPending}>Adicionar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar departamento</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) saveDept.mutate(); }}>
            <div className="space-y-1.5"><Label>Nome *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={saveDept.isPending}>Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
