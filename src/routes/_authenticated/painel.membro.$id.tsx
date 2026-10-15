import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberAvatar, MemberForm, type MemberDraft } from "@/components/members/MemberForm";
import { APPROVAL_LABELS, MEMBER_STATUS, ageFrom, brl, dateBR } from "@/lib/church";
import { siteMeta } from "@/lib/site-query";
import { memberSaveError, saveMemberDepartmentLinks } from "@/lib/departments";
import { useChurchRoles, useDepartments, useMemberDepartments } from "@/hooks/use-departments";

export const Route = createFileRoute("/_authenticated/painel/membro/$id")({
  head: () =>
    siteMeta("Perfil do membro — Comunidade Aava", "Dados e histórico de dízimos do membro."),
  component: MemberProfile,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children || "—"}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function MemberProfile() {
  const { id } = Route.useParams();
  const { can, isLoading: loadingAccess } = useAccess();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<MemberDraft | null>(null);
  const [year, setYear] = useState("todos");
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [leaderIds, setLeaderIds] = useState<string[]>([]);
  const roles = useChurchRoles();
  const canLinkDepartments = can("manage_departments");
  const departments = useDepartments();
  const memberDepts = useMemberDepartments(can("view_members") || can("view_departments"));

  const member = useQuery({
    queryKey: ["member", id],
    enabled: can("view_members"),
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const notes = useQuery({
    queryKey: ["member-notes", id],
    enabled: can("view_member_notes"),
    queryFn: async () => {
      const { data } = await supabase
        .from("member_notes")
        .select("notes")
        .eq("member_id", id)
        .maybeSingle();
      return data?.notes ?? "";
    },
  });

  // Dízimos e ofertas vêm do Financeiro: são as receitas ligadas a este membro.
  const contributions = useQuery({
    queryKey: ["transactions", "member", id],
    enabled: can("view_finance"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("id, category, amount, occurred_on, payment_method, description")
        .eq("member_id", id)
        .eq("kind", "entrada")
        .order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (m: MemberDraft) => {
      const { id: _id, ...rest } = m;
      const { error } = await supabase
        .from("members")
        .update({ ...rest, notes: null })
        .eq("id", id);
      if (error) throw error;
      if (canLinkDepartments) {
        await saveMemberDepartmentLinks({
          memberId: id,
          departmentIds: deptIds,
          leaderDepartmentIds: leaderIds,
          isLeadershipRole: !!roles.data?.find((r) => r.id === m.church_role_id)?.is_leadership,
          currentLeaders: Object.fromEntries((departments.data ?? []).map((d) => [d.id, d.leader_member_id])),
        });
      }
    },
    onSuccess: () => {
      toast.success("Cadastro salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["member", id] });
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["member-departments"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      qc.invalidateQueries({ queryKey: ["my-dept-roles"] });
    },
    onError: (e: Error) => toast.error(memberSaveError(e)),
  });

  const all = useMemo(() => contributions.data ?? [], [contributions.data]);
  const years = useMemo(
    () =>
      Array.from(
        new Set([String(new Date().getFullYear()), ...all.map((t) => t.occurred_on.slice(0, 4))]),
      )
        .sort()
        .reverse(),
    [all],
  );
  const shown = year === "todos" ? all : all.filter((t) => t.occurred_on.startsWith(year));
  const sum = (l: typeof all) => l.reduce((acc, t) => acc + Number(t.amount), 0);

  if (loadingAccess) return null;
  if (!can("view_members"))
    return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;
  if (member.isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  const m = member.data;
  const back = (
    <Link
      to="/painel/membros"
      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Voltar para membros
    </Link>
  );
  if (!m) {
    return (
      <div>
        {back}
        <p className="mt-6 text-muted-foreground">Membro não encontrado.</p>
      </div>
    );
  }

  const age = ageFrom(m.birth_date);
  const cityLine = [m.neighborhood, m.city].filter(Boolean).join(" · ");
  const thisYear = String(new Date().getFullYear());

  return (
    <div className="max-w-4xl">
      {back}

      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <MemberAvatar path={m.photo_path} size="h-20 w-20" />
          <div>
            <h1 className="text-3xl text-foreground">{m.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={m.status === "membro_ativo" ? "default" : "secondary"}>
                {MEMBER_STATUS[m.status] ?? m.status}
              </Badge>
              {m.baptized && <Badge variant="outline">Batizado</Badge>}
              {m.approval_status !== "aprovado" && (
                <Badge variant="outline">
                  {APPROVAL_LABELS[m.approval_status] ?? m.approval_status}
                </Badge>
              )}
              {age !== null && <span className="text-sm text-muted-foreground">{age} anos</span>}
            </div>
          </div>
        </div>
        {can("edit_member") && (
          <Button variant="outline" onClick={() => {
              setDeptIds((memberDepts.data?.get(m.id) ?? []).map((d) => d.id));
              setLeaderIds((departments.data ?? []).filter((d) => d.leader_member_id === m.id).map((d) => d.id));
              setEditing({ ...m });
            }}>
            <Pencil className="h-4 w-4" /> Editar cadastro
          </Button>
        )}
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Block title="Dados pessoais">
          <Field label="Data de nascimento">{dateBR(m.birth_date)}</Field>
          <Field label="Estado civil">{m.marital_status}</Field>
          <Field label="CPF">{m.cpf}</Field>
          <Field label="RG">{m.rg}</Field>
          <Field label="Telefone">{m.phone}</Field>
          <Field label="E-mail">{m.email}</Field>
        </Block>

        <Block title="Endereço">
          <Field label="Rua e número">{m.address}</Field>
          <Field label="Bairro">{m.neighborhood}</Field>
          <Field label="Cidade">{m.city}</Field>
          <Field label="CEP">{m.zip_code}</Field>
        </Block>

        <Block title="Vida na igreja">
          <Field label="Matrícula">{m.registration_number}</Field>
          <Field label="Filiação">{dateBR(m.affiliated_on)}</Field>
          <Field label="Batizado">
            {m.baptized ? `Sim${m.baptism_date ? `, em ${dateBR(m.baptism_date)}` : ""}` : "Não"}
          </Field>
          <Field label="Igreja onde se batizou">{m.baptized ? m.baptism_church : ""}</Field>
          <Field label="Departamento">{(memberDepts.data?.get(m.id) ?? []).map((d) => d.name).join(", ")}</Field>
          <Field label="Cargo">{roles.data?.find((r) => r.id === m.church_role_id)?.name}</Field>
        </Block>

        {can("view_member_notes") && (
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground">Observações internas</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">
              {notes.data || "Nenhuma observação."}
            </p>
          </section>
        )}
      </div>

      {can("view_finance") && (
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl text-foreground">Dízimos e ofertas</h2>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os anos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Dízimos em {thisYear}</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {brl(
                  sum(
                    all.filter(
                      (t) => t.category === "Dízimos" && t.occurred_on.startsWith(thisYear),
                    ),
                  ),
                )}
              </dd>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Ofertas em {thisYear}</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {brl(
                  sum(
                    all.filter(
                      (t) => t.category === "Ofertas" && t.occurred_on.startsWith(thisYear),
                    ),
                  ),
                )}
              </dd>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Total geral</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{brl(sum(all))}</dd>
            </div>
          </dl>

          <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Data</th>
                  <th className="p-4 font-medium">Categoria</th>
                  <th className="p-4 font-medium">Forma</th>
                  <th className="p-4 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {contributions.isLoading && (
                  <tr>
                    <td colSpan={4} className="p-4 text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!contributions.isLoading && shown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Nenhum dízimo ou oferta registrado para este membro.
                    </td>
                  </tr>
                )}
                {shown.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap p-4 text-foreground">
                      {dateBR(t.occurred_on)}
                    </td>
                    <td className="p-4 text-foreground">
                      {t.category}
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground">{t.payment_method ?? "—"}</td>
                    <td className="whitespace-nowrap p-4 text-right font-medium text-foreground">
                      {brl(Number(t.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Para registrar, vá em{" "}
            <Link to="/painel/financeiro" className="underline hover:text-foreground">
              Financeiro
            </Link>
            , clique em Receita, escolha Dízimos ou Ofertas e selecione este membro.
          </p>
        </section>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cadastro</DialogTitle>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(editing);
              }}
              className="space-y-6"
            >
              <MemberForm
                mode="admin"
                value={editing}
                onChange={setEditing}
                photoFolder={editing.user_id ?? "admin"}
                {...(canLinkDepartments
                  ? {
                      departments: (departments.data ?? []).map((d) => ({ id: d.id, name: d.name })),
                      departmentIds: deptIds,
                      onDepartmentIdsChange: setDeptIds,
                      roles: (roles.data ?? []).map((r) => ({ id: r.id, name: r.name, is_leadership: r.is_leadership })),
                      leaderDepartmentIds: leaderIds,
                      onLeaderDepartmentIdsChange: setLeaderIds,
                    }
                  : {})}
              />
              <Button type="submit" className="w-full" disabled={save.isPending}>
                Salvar cadastro
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
