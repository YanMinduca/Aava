import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Crown, Network, Pencil, Plus, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { useChurchRoles, useDeptAccess, useDepartments } from "@/hooks/use-departments";
import { DEPT_PERMISSIONS } from "@/lib/church";
import { siteMeta } from "@/lib/site-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/painel/departamentos")({
  head: () => siteMeta("Departamentos — Comunidade Aava", "Departamentos, voluntários, líderes e cargos da Comunidade Aava."),
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const { isFullAccess } = useAccess();
  const { manageAll, canViewPage, isLoading } = useDeptAccess();

  if (isLoading) return null;
  if (!canViewPage) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  return (
    <div>
      <h1 className="text-3xl text-foreground">Departamentos</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Organize voluntários e líderes por departamento. Os cargos definem o que cada pessoa pode fazer dentro do departamento dela.
      </p>
      <Tabs defaultValue="departamentos" className="mt-6">
        <TabsList>
          <TabsTrigger value="departamentos">Departamentos</TabsTrigger>
          {isFullAccess && <TabsTrigger value="cargos">Cargos</TabsTrigger>}
        </TabsList>
        <TabsContent value="departamentos">
          <DepartmentList canManage={manageAll} />
        </TabsContent>
        {isFullAccess && (
          <TabsContent value="cargos">
            <RolesManager />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function DepartmentList({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useDepartments();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("departments")
        .insert({ name: name.trim(), description: description.trim() || null, created_by: u.user?.id ?? null });
      if (error) throw new Error(error.code === "23505" ? "Já existe um departamento com esse nome." : error.message);
    },
    onSuccess: () => {
      toast.success("Departamento criado");
      setOpen(false);
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Adicionar departamento</Button>
        </div>
      )}
      {isLoading && <p className="mt-4 text-muted-foreground">Carregando...</p>}
      {!isLoading && data.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Network className="mx-auto mb-3 h-6 w-6" />
          {canManage ? "Nenhum departamento ainda. Clique em “Adicionar departamento” para criar o primeiro." : "Nenhum departamento disponível para você."}
        </div>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((d) => (
          <Link
            key={d.id}
            to="/painel/departamento/$id"
            params={{ id: d.id }}
            className="rounded-2xl border bg-card p-5 transition-colors hover:border-primary"
          >
            <p className="font-display text-lg text-foreground">{d.name}</p>
            {d.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {d.member_count} {d.member_count === 1 ? "voluntário" : "voluntários"}</span>
              <span className="inline-flex items-center gap-1.5"><Crown className="h-4 w-4" /> {d.leader_name ?? "Sem líder"}</span>
            </div>
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo departamento</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Louvor, Mídia, Infantil" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>Criar departamento</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RoleDraft = { id?: string; name: string; description: string; permissions: string[]; is_system?: boolean };

function RolesManager() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useChurchRoles();
  const [editing, setEditing] = useState<RoleDraft | null>(null);

  const save = useMutation({
    mutationFn: async (r: RoleDraft) => {
      const payload = { name: r.name.trim(), description: r.description.trim() || null, permissions: r.permissions };
      const { error } = r.id
        ? await supabase.from("church_roles").update(payload).eq("id", r.id)
        : await supabase.from("church_roles").insert(payload);
      if (error) throw new Error(error.code === "23505" ? "Já existe um cargo com esse nome." : error.message);
    },
    onSuccess: () => {
      toast.success("Cargo salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["church-roles"] });
      qc.invalidateQueries({ queryKey: ["my-dept-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("church_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["church-roles"] });
      qc.invalidateQueries({ queryKey: ["department-roster"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = (k: string) => DEPT_PERMISSIONS.find((p) => p.key === k)?.label ?? k;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Um cargo define o que a pessoa pode fazer no departamento em que está vinculada. Só o CEO e o Pastor Presidente criam cargos e liberam permissões.
        </p>
        <Button onClick={() => setEditing({ name: "", description: "", permissions: ["dept_view"] })}><Plus className="h-4 w-4" /> Criar cargo</Button>
      </div>
      {isLoading && <p className="mt-4 text-muted-foreground">Carregando...</p>}
      <div className="mt-4 divide-y rounded-2xl border bg-card">
        {data.map((r: Tables<"church_roles">) => (
          <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{r.name} {r.is_system && <Badge variant="secondary" className="ml-2">Padrão</Badge>}</p>
              {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.permissions.length === 0 && <span className="text-xs text-muted-foreground">Sem permissões</span>}
                {r.permissions.map((p) => <Badge key={p} variant="outline">{label(p)}</Badge>)}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" aria-label="Editar cargo" onClick={() => setEditing({ id: r.id, name: r.name, description: r.description ?? "", permissions: r.permissions, is_system: r.is_system })}><Pencil className="h-4 w-4" /></Button>
              {!r.is_system && (
                <Button size="icon" variant="ghost" aria-label="Excluir cargo" onClick={() => confirm(`Excluir o cargo ${r.name}? Quem tem esse cargo fica sem permissões no departamento.`) && remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cargo" : "Novo cargo"}</DialogTitle></DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (editing.name.trim()) save.mutate(editing);
              }}
            >
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex.: Vice-líder, Tesoureiro do departamento" />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>O que este cargo permite no departamento</Label>
                {DEPT_PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm">
                    <Checkbox
                      checked={editing.permissions.includes(p.key)}
                      onCheckedChange={(on) =>
                        setEditing({ ...editing, permissions: on ? [...editing.permissions, p.key] : editing.permissions.filter((x) => x !== p.key) })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              <Button type="submit" className="w-full" disabled={save.isPending}>Salvar cargo</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
