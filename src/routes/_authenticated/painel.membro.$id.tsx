import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
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
import { TitheDialog, type TitheRow } from "@/components/tithes/TitheDialog";
import { TitheTable, useDeleteTithe } from "@/components/tithes/TitheTable";
import { APPROVAL_LABELS, MEMBER_STATUS, ageFrom, brl, dateBR } from "@/lib/church";
import { siteMeta } from "@/lib/site-query";

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
  const del = useDeleteTithe();
  const [editing, setEditing] = useState<MemberDraft | null>(null);
  const [titheDialog, setTitheDialog] = useState<{ open: boolean; tithe: TitheRow | null }>({
    open: false,
    tithe: null,
  });
  const [year, setYear] = useState("todos");

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

  const tithes = useQuery({
    queryKey: ["tithes", "member", id],
    enabled: can("view_finance"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tithes")
        .select("*")
        .eq("member_id", id)
        .order("paid_on", { ascending: false });
      if (error) throw error;
      return data as TitheRow[];
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
    },
    onSuccess: () => {
      toast.success("Cadastro salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["member", id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = useMemo(() => tithes.data ?? [], [tithes.data]);
  const years = useMemo(
    () =>
      Array.from(
        new Set([String(new Date().getFullYear()), ...all.map((t) => t.paid_on.slice(0, 4))]),
      )
        .sort()
        .reverse(),
    [all],
  );
  const shown = year === "todos" ? all : all.filter((t) => t.paid_on.startsWith(year));
  const sum = (l: TitheRow[]) => l.reduce((s, t) => s + Number(t.amount), 0);

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
          <Button variant="outline" onClick={() => setEditing({ ...m })}>
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
          <Field label="Entrada na igreja">{dateBR(m.joined_on)}</Field>
          <Field label="Filiação">{dateBR(m.affiliated_on)}</Field>
          <Field label="Batizado">
            {m.baptized ? `Sim${m.baptism_date ? `, em ${dateBR(m.baptism_date)}` : ""}` : "Não"}
          </Field>
          <Field label="Igreja onde se batizou">{m.baptized ? m.baptism_church : ""}</Field>
          <Field label="Ministério">{m.ministry}</Field>
          <Field label="Departamento">{m.department}</Field>
          <Field label="Cargo">{m.church_role}</Field>
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
            <h2 className="text-2xl text-foreground">Histórico de dízimos</h2>
            <div className="flex gap-2">
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
              {can("create_financial_transaction") && (
                <Button onClick={() => setTitheDialog({ open: true, tithe: null })}>
                  <Plus className="h-4 w-4" /> Registrar dízimo
                </Button>
              )}
            </div>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Total em {thisYear}</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {brl(sum(all.filter((t) => t.paid_on.startsWith(thisYear))))}
              </dd>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Total geral</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{brl(sum(all))}</dd>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <dt className="text-sm text-muted-foreground">Último dízimo</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {all[0] ? dateBR(all[0].paid_on) : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <TitheTable
              rows={shown}
              loading={tithes.isLoading}
              {...(can("edit_financial_transaction")
                ? { onEdit: (t: TitheRow) => setTitheDialog({ open: true, tithe: t }) }
                : {})}
              {...(can("delete_financial_transaction")
                ? { onDelete: (t: TitheRow) => confirm("Excluir este dízimo?") && del.mutate(t.id) }
                : {})}
            />
          </div>
        </section>
      )}

      <TitheDialog
        open={titheDialog.open}
        tithe={titheDialog.tithe}
        memberId={m.id}
        memberName={m.full_name}
        onClose={() => setTitheDialog({ open: false, tithe: null })}
      />

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
