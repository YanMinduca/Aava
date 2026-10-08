import { createFileRoute, Link } from "@tanstack/react-router";
import { siteMeta } from '@/lib/site-query';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Download, Target, Paperclip, Pencil, FileText, Repeat, CheckCircle2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, MONTHS, PAYMENT_METHODS, brl, dateBR } from "@/lib/church";
import { byCategory, downloadCsv, expenses, goalProgress, inPeriod, incomes, sum, txCsvRows, type Goal, type Tx } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/painel/financeiro")({
  head: () => siteMeta('Financeiro — Comunidade Aava', 'Receitas, despesas e metas financeiras da igreja.'),
  component: FinancePage,
});

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)", "var(--primary)"];
const today = () => new Date().toISOString().slice(0, 10);
const GOAL_STATUS: Record<string, string> = { em_andamento: "Em andamento", concluida: "Concluída", pausada: "Pausada", cancelada: "Cancelada" };

type TxDraft = { id?: string; kind: string; category: string; amount: string; occurred_on: string; description: string; responsible: string; payment_method: string; notes: string; receipt_path: string | null };
const emptyTx = (kind = "entrada"): TxDraft => ({ kind, category: kind === "entrada" ? "Dízimos" : "Aluguel", amount: "", occurred_on: today(), description: "", responsible: "", payment_method: "Pix", notes: "", receipt_path: null });

function Sel({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: [string, string][]; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function FinancePage() {
  const { can } = useAccess();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tx, setTx] = useState<TxDraft | null>(null);

  const txs = useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_transactions").select("*").order("occurred_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const all = txs.data ?? [];
  const years = useMemo(() => Array.from(new Set([now.getFullYear(), ...all.map((t) => Number(t.occurred_on.slice(0, 4)))])).sort((a, b) => b - a), [all]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    ["transactions", "goals", "bills"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const saveTx = useMutation({
    mutationFn: async (d: TxDraft) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        kind: d.kind, category: d.category, amount: Number(d.amount), occurred_on: d.occurred_on,
        description: d.description || null, responsible: d.responsible || null, payment_method: d.payment_method || null,
        notes: d.notes || null, receipt_path: d.receipt_path,
      };
      const { error } = d.id
        ? await supabase.from("financial_transactions").update(payload).eq("id", d.id)
        : await supabase.from("financial_transactions").insert({ ...payload, created_by: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lançamento salvo"); setTx(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!can("view_finance")) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-foreground">Financeiro</h1>
        <div className="flex flex-wrap gap-2">
          <div className="w-36"><Sel value={String(month)} onChange={(v) => setMonth(Number(v))} options={MONTHS.map((m, i) => [String(i + 1), m])} /></div>
          <div className="w-28"><Sel value={String(year)} onChange={(v) => setYear(Number(v))} options={years.map((y) => [String(y), String(y)])} /></div>
          {can("create_financial_transaction") && (
            <>
              <Button variant="outline" onClick={() => setTx(emptyTx("saida"))}><Plus className="h-4 w-4" /> Despesa</Button>
              <Button onClick={() => setTx(emptyTx("entrada"))}><Plus className="h-4 w-4" /> Receita</Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="flex-wrap">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="recorrentes">Contas recorrentes</TabsTrigger>
          {can("view_financial_reports") && <TabsTrigger value="relatorios">Relatórios</TabsTrigger>}
        </TabsList>
        <TabsContent value="resumo"><Summary all={all} year={year} month={month} /></TabsContent>
        <TabsContent value="lancamentos"><TxList all={all} year={year} month={month} onEdit={(t) => setTx(t)} onChanged={invalidate} /></TabsContent>
        <TabsContent value="metas"><Goals all={all} /></TabsContent>
        <TabsContent value="recorrentes"><Bills all={all} year={year} month={month} onChanged={invalidate} /></TabsContent>
        {can("view_financial_reports") && <TabsContent value="relatorios"><Reports year={year} month={month} /></TabsContent>}
      </Tabs>

      <TxDialog draft={tx} setDraft={setTx} onSave={(d) => saveTx.mutate(d)} saving={saveTx.isPending} />
    </div>
  );
}

/* ---------------- Resumo ---------------- */
function Summary({ all, year, month }: { all: Tx[]; year: number; month: number }) {
  const { can } = useAccess();
  const m = inPeriod(all, year, month);
  const y = inPeriod(all, year);
  const mi = sum(incomes(m)), me = sum(expenses(m));
  const yi = sum(incomes(y)), ye = sum(expenses(y));
  const monthly = MONTHS.map((name, i) => {
    const l = inPeriod(all, year, i + 1);
    return { mes: name.slice(0, 3), Receitas: sum(incomes(l)), Despesas: sum(expenses(l)), Saldo: sum(incomes(l)) - sum(expenses(l)) };
  });
  const yearsAll = Array.from(new Set(all.map((t) => Number(t.occurred_on.slice(0, 4))))).sort();
  const annual = yearsAll.map((yy) => {
    const l = inPeriod(all, yy);
    return { ano: String(yy), Receitas: sum(incomes(l)), Despesas: sum(expenses(l)) };
  });
  const reports = can("view_financial_reports");

  return (
    <div className="mt-4 space-y-6">
      <p className="text-sm text-muted-foreground">{MONTHS[month - 1]} de {year}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Receitas do mês" value={brl(mi)} tone="text-success" />
        <Stat label="Despesas do mês" value={brl(me)} tone="text-destructive" />
        <Stat label="Saldo do mês" value={brl(mi - me)} tone={mi - me >= 0 ? "text-foreground" : "text-destructive"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Statement title="Receitas" rows={byCategory(incomes(m))} total={mi} tone="text-success" />
        <Statement title="Despesas" rows={byCategory(expenses(m))} total={me} tone="text-destructive" />
      </div>

      {reports && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label={`Receita anual ${year}`} value={brl(yi)} tone="text-success" />
            <Stat label={`Despesa anual ${year}`} value={brl(ye)} tone="text-destructive" />
            <Stat label={`Saldo anual ${year}`} value={brl(yi - ye)} tone="text-foreground" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Receitas por categoria (mês)"><CatPie data={byCategory(incomes(m))} /></ChartCard>
            <ChartCard title="Despesas por categoria (mês)"><CatPie data={byCategory(expenses(m))} /></ChartCard>
          </div>
          <ChartCard title={`Receita × despesa — ${year}`}>
            <ResponsiveContainer>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Legend />
                <Bar dataKey="Receitas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Despesas" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={`Evolução do saldo mensal — ${year}`}>
              <ResponsiveContainer>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Line type="monotone" dataKey="Saldo" stroke="var(--primary)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Evolução anual">
              <ResponsiveContainer>
                <BarChart data={annual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="ano" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip formatter={(v: number) => brl(v)} />
                  <Legend />
                  <Bar dataKey="Receitas" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Despesas" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function Statement({ title, rows, total, tone }: { title: string; rows: { name: string; value: number }[]; total: number; tone: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2 text-sm">
        {rows.length === 0 && <p className="text-muted-foreground">Nenhum lançamento.</p>}
        {rows.map((r) => (
          <div key={r.name} className="flex justify-between"><span className="text-foreground">{r.name}</span><span className="tabular-nums text-foreground">{brl(r.value)}</span></div>
        ))}
      </div>
      <div className="mt-3 flex justify-between border-t pt-3 font-semibold"><span className="text-foreground">Total</span><span className={`tabular-nums ${tone}`}>{brl(total)}</span></div>
    </div>
  );
}

function CatPie({ data }: { data: { name: string; value: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground">Sem dados no período.</p>;
  return (
    <ResponsiveContainer>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => brl(v)} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <p className="mb-4 font-semibold text-foreground">{title}</p>
      <div className="h-64">{children}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 font-display text-3xl tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/* ---------------- Lançamentos ---------------- */
function TxList({ all, year, month, onEdit, onChanged }: { all: Tx[]; year: number; month: number; onEdit: (d: TxDraft) => void; onChanged: () => void }) {
  const { can } = useAccess();
  const [kind, setKind] = useState("todos");
  const [scope, setScope] = useState("mes");
  const base = scope === "mes" ? inPeriod(all, year, month) : inPeriod(all, year);
  const list = kind === "todos" ? base : base.filter((t) => t.kind === kind);

  async function openReceipt(path: string) {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }
  async function del(id: string) {
    if (!confirm("Excluir lançamento?")) return;
    const { error } = await supabase.from("financial_transactions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="w-40"><Sel value={scope} onChange={setScope} options={[["mes", "Mês selecionado"], ["ano", "Ano inteiro"]]} /></div>
        <div className="w-40"><Sel value={kind} onChange={setKind} options={[["todos", "Receitas e despesas"], ["entrada", "Só receitas"], ["saida", "Só despesas"]]} /></div>
        {can("export_financial_reports") && (
          <Button variant="outline" onClick={() => downloadCsv(`lancamentos-${year}${scope === "mes" ? "-" + month : ""}.csv`, txCsvRows(list))}><Download className="h-4 w-4" /> CSV</Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr><th className="p-4 font-medium">Data</th><th className="p-4 font-medium">Categoria</th><th className="p-4 font-medium">Descrição</th><th className="p-4 font-medium">Responsável / Método</th><th className="p-4 text-right font-medium">Valor</th><th /></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum lançamento no período.</td></tr>}
            {list.map((t) => (
              <tr key={t.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap p-4 text-muted-foreground">{dateBR(t.occurred_on)}</td>
                <td className="p-4 text-foreground">{t.category}</td>
                <td className="p-4 text-muted-foreground">{t.description}{t.notes && <p className="text-xs italic">{t.notes}</p>}</td>
                <td className="p-4 text-muted-foreground">{t.responsible || "—"}<p className="text-xs">{t.payment_method}</p></td>
                <td className={`whitespace-nowrap p-4 text-right font-semibold tabular-nums ${t.kind === "entrada" ? "text-success" : "text-destructive"}`}>{t.kind === "entrada" ? "+" : "−"} {brl(Number(t.amount))}</td>
                <td className="whitespace-nowrap p-2 text-right">
                  {t.receipt_path && <Button size="icon" variant="ghost" title="Comprovante" onClick={() => openReceipt(t.receipt_path!)}><Paperclip className="h-4 w-4" /></Button>}
                  {can("edit_financial_transaction") && (
                    <Button size="icon" variant="ghost" onClick={() => onEdit({ id: t.id, kind: t.kind, category: t.category, amount: String(t.amount), occurred_on: t.occurred_on, description: t.description ?? "", responsible: t.responsible ?? "", payment_method: t.payment_method ?? "", notes: t.notes ?? "", receipt_path: t.receipt_path })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {can("delete_financial_transaction") && <Button size="icon" variant="ghost" onClick={() => del(t.id)}><Trash2 className="h-4 w-4" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TxDialog({ draft, setDraft, onSave, saving }: { draft: TxDraft | null; setDraft: (d: TxDraft | null) => void; onSave: (d: TxDraft) => void; saving: boolean }) {
  const [uploading, setUploading] = useState(false);
  if (!draft) return null;
  const set = (p: Partial<TxDraft>) => setDraft({ ...draft, ...p });
  const cats = draft.kind === "entrada" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function upload(f: File) {
    setUploading(true);
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${f.name.split(".").pop() ?? "pdf"}`;
    const { error } = await supabase.storage.from("receipts").upload(path, f);
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    set({ receipt_path: path });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{draft.id ? "Editar lançamento" : draft.kind === "entrada" ? "Nova receita" : "Nova despesa"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Tipo</Label>
              <Sel value={draft.kind} onChange={(v) => set({ kind: v, category: (v === "entrada" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0] ?? "" })} options={[["entrada", "Receita"], ["saida", "Despesa"]]} />
            </div>
            <div className="space-y-1.5"><Label>Categoria</Label><Sel value={draft.category} onChange={(v) => set({ category: v })} options={cats.map((c) => [c, c])} /></div>
            <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0.01" required value={draft.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Data</Label><Input type="date" required value={draft.occurred_on} onChange={(e) => set({ occurred_on: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Responsável</Label><Input value={draft.responsible} onChange={(e) => set({ responsible: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Método de pagamento</Label><Sel value={draft.payment_method} onChange={(v) => set({ payment_method: v })} options={PAYMENT_METHODS.map((m) => [m, m])} /></div>
          </div>
          <div className="space-y-1.5"><Label>Descrição</Label><Input value={draft.description} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Observação</Label><Textarea rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} /></div>
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm text-foreground hover:bg-accent">
              <Paperclip className="h-4 w-4" /> {uploading ? "Enviando..." : draft.receipt_path ? "Trocar comprovante" : "Anexar comprovante"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            {draft.receipt_path && <span className="text-xs text-success">Comprovante anexado</span>}
          </div>
          <Button type="submit" className="w-full" disabled={saving || uploading}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Metas ---------------- */
type GoalDraft = { id?: string; title: string; target_amount: string; category: string; start_date: string; deadline: string; recurrence: string; responsible: string; status: string; manual_amount: string };
const emptyGoal: GoalDraft = { title: "", target_amount: "", category: "", start_date: today(), deadline: "", recurrence: "nao", responsible: "", status: "em_andamento", manual_amount: "" };

function Goals({ all }: { all: Tx[] }) {
  const { can } = useAccess();
  const qc = useQueryClient();
  const [d, setD] = useState<GoalDraft | null>(null);
  const goals = useQuery({
    queryKey: ["goals"],
    queryFn: async () => (await supabase.from("financial_goals").select("*").order("created_at")).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (g: GoalDraft) => {
      const payload = {
        title: g.title, target_amount: Number(g.target_amount), category: g.category || null, start_date: g.start_date || null,
        deadline: g.deadline || null, recurrence: g.recurrence, responsible: g.responsible || null, status: g.status,
        manual_amount: !g.category && g.manual_amount ? Number(g.manual_amount) : null,
      };
      const { error } = g.id ? await supabase.from("financial_goals").update(payload).eq("id", g.id) : await supabase.from("financial_goals").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Meta salva"); setD(null); qc.invalidateQueries({ queryKey: ["goals"] }); },
    onError: (e) => toast.error(e.message),
  });
  const del = async (id: string) => { if (confirm("Excluir meta?")) { await supabase.from("financial_goals").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["goals"] }); } };
  const edit = (g: Goal) => setD({ id: g.id, title: g.title, target_amount: String(g.target_amount), category: g.category ?? "", start_date: g.start_date ?? "", deadline: g.deadline ?? "", recurrence: g.recurrence, responsible: g.responsible ?? "", status: g.status, manual_amount: g.manual_amount !== null ? String(g.manual_amount) : "" });

  return (
    <div className="mt-4 space-y-4">
      {can("create_financial_goal") && <Button variant="outline" onClick={() => setD({ ...emptyGoal })}><Target className="h-4 w-4" /> Nova meta</Button>}
      {(goals.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhuma meta criada.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(goals.data ?? []).map((g) => {
          const p = goalProgress(g, all);
          return (
            <div key={g.id} className="rounded-2xl border bg-card p-5">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.recurrence === "mensal" ? "Meta mensal · mês atual" : `${dateBR(g.start_date)} até ${dateBR(g.deadline)}`}
                    {g.responsible ? ` · ${g.responsible}` : ""}
                  </p>
                </div>
                <div className="flex items-start gap-1">
                  <Badge variant={g.status === "concluida" ? "default" : "secondary"}>{GOAL_STATUS[g.status]}</Badge>
                  {can("edit_financial_goal") && <><Button size="icon" variant="ghost" onClick={() => edit(g)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => del(g.id)}><Trash2 className="h-4 w-4" /></Button></>}
                </div>
              </div>
              <Progress value={p.pct} className="mt-4 h-3" />
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold text-foreground">{p.pct.toFixed(0)}%</span>
                <span className="tabular-nums text-muted-foreground">{brl(p.raised)} / {brl(p.target)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Faltam {brl(p.remaining)} · {g.category ? `contando ${g.category}` : g.manual_amount !== null ? "valor informado manualmente" : "contando todas as receitas"}</p>
            </div>
          );
        })}
      </div>

      <Dialog open={!!d} onOpenChange={(o) => !o && setD(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{d?.id ? "Editar meta" : "Nova meta"}</DialogTitle></DialogHeader>
          {d && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(d); }}>
              <div className="space-y-1.5"><Label>Nome</Label><Input required value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Ex.: Compra de novo equipamento" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" step="0.01" min="1" required value={d.target_amount} onChange={(e) => setD({ ...d, target_amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Repetição</Label><Sel value={d.recurrence} onChange={(v) => setD({ ...d, recurrence: v })} options={[["nao", "Não"], ["mensal", "Mensal (recorrente)"]]} /></div>
                {d.recurrence !== "mensal" && (
                  <>
                    <div className="space-y-1.5"><Label>Data inicial</Label><Input type="date" value={d.start_date} onChange={(e) => setD({ ...d, start_date: e.target.value })} /></div>
                    <div className="space-y-1.5"><Label>Data final</Label><Input type="date" value={d.deadline} onChange={(e) => setD({ ...d, deadline: e.target.value })} /></div>
                  </>
                )}
                <div className="space-y-1.5"><Label>Responsável</Label><Input value={d.responsible} onChange={(e) => setD({ ...d, responsible: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Status</Label><Sel value={d.status} onChange={(v) => setD({ ...d, status: v })} options={Object.entries(GOAL_STATUS)} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Como medir o valor alcançado</Label>
                <Sel value={d.category || (d.manual_amount !== "" ? "__manual" : "__todas")} onChange={(v) => setD({ ...d, category: v.startsWith("__") ? "" : v, manual_amount: v === "__manual" ? d.manual_amount || "0" : "" })}
                  options={[["__todas", "Somar todas as receitas do período"], ...INCOME_CATEGORIES.map((c): [string, string] => [c, `Somar receitas de ${c}`]), ["__manual", "Informar manualmente"]]} />
              </div>
              {!d.category && d.manual_amount !== "" && (
                <div className="space-y-1.5"><Label>Valor alcançado (R$)</Label><Input type="number" step="0.01" min="0" value={d.manual_amount} onChange={(e) => setD({ ...d, manual_amount: e.target.value })} /></div>
              )}
              <Button type="submit" className="w-full" disabled={save.isPending}>Salvar meta</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Contas recorrentes ---------------- */
function Bills({ all, year, month, onChanged }: { all: Tx[]; year: number; month: number; onChanged: () => void }) {
  const { can } = useAccess();
  const qc = useQueryClient();
  const [d, setD] = useState<{ name: string; category: string; amount: string; due_day: string; payment_method: string } | null>(null);
  const bills = useQuery({ queryKey: ["bills"], queryFn: async () => (await supabase.from("recurring_bills").select("*").order("due_day")).data ?? [] });
  const monthTx = inPeriod(all, year, month);

  async function add() {
    if (!d) return;
    const { error } = await supabase.from("recurring_bills").insert({ name: d.name, category: d.category, amount: Number(d.amount), due_day: Number(d.due_day), payment_method: d.payment_method });
    if (error) { toast.error(error.message); return; }
    setD(null);
    qc.invalidateQueries({ queryKey: ["bills"] });
  }
  async function pay(b: { name: string; category: string; amount: number; due_day: number; payment_method: string | null }) {
    const { data: u } = await supabase.auth.getUser();
    const day = Math.min(b.due_day, new Date(year, month, 0).getDate());
    const { error } = await supabase.from("financial_transactions").insert({
      kind: "saida", category: b.category, amount: b.amount, description: b.name, payment_method: b.payment_method,
      occurred_on: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, created_by: u.user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Despesa lançada");
    onChanged();
  }
  async function del(id: string) { await supabase.from("recurring_bills").delete().eq("id", id); qc.invalidateQueries({ queryKey: ["bills"] }); }

  const list = bills.data ?? [];
  const total = list.filter((b) => b.active).reduce((s, b) => s + Number(b.amount), 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Total mensal previsto: <span className="font-semibold text-foreground">{brl(total)}</span></p>
        {can("edit_financial_transaction") && <Button variant="outline" onClick={() => setD({ name: "", category: "Aluguel", amount: "", due_day: "10", payment_method: "Pix" })}><Repeat className="h-4 w-4" /> Nova conta recorrente</Button>}
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {list.length === 0 && <p className="p-5 text-sm text-muted-foreground">Cadastre contas fixas como aluguel, energia e internet para lançar todo mês com um clique.</p>}
        {list.map((b) => {
          const paid = monthTx.some((t) => t.kind === "saida" && t.description === b.name);
          return (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium text-foreground">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.category} · vence dia {b.due_day} · {b.payment_method}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tabular-nums text-foreground">{brl(Number(b.amount))}</span>
                {paid ? (
                  <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" /> Lançada em {MONTHS[month - 1]}</Badge>
                ) : (
                  can("create_financial_transaction") && <Button size="sm" onClick={() => pay({ ...b, amount: Number(b.amount) })}>Lançar em {MONTHS[month - 1]}</Button>
                )}
                {can("edit_financial_transaction") && <Button size="icon" variant="ghost" onClick={() => del(b.id)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!d} onOpenChange={(o) => !o && setD(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova conta recorrente</DialogTitle></DialogHeader>
          {d && (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); add(); }}>
              <div className="space-y-1.5"><Label>Nome</Label><Input required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Conta de energia" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Categoria</Label><Sel value={d.category} onChange={(v) => setD({ ...d, category: v })} options={EXPENSE_CATEGORIES.map((c) => [c, c])} /></div>
                <div className="space-y-1.5"><Label>Valor (R$)</Label><Input type="number" step="0.01" min="0.01" required value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Dia do vencimento</Label><Input type="number" min="1" max="31" required value={d.due_day} onChange={(e) => setD({ ...d, due_day: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Método</Label><Sel value={d.payment_method} onChange={(v) => setD({ ...d, payment_method: v })} options={PAYMENT_METHODS.map((m) => [m, m])} /></div>
              </div>
              <Button type="submit" className="w-full">Salvar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Relatórios ---------------- */
function Reports({ year, month }: { year: number; month: number }) {
  const { can } = useAccess();
  const items = [
    { tipo: "mensal", t: "Relatório mensal", d: `${MONTHS[month - 1]} de ${year}` },
    { tipo: "anual", t: "Relatório anual", d: `Ano de ${year}, mês a mês` },
    { tipo: "receitas", t: "Relatório de receitas", d: `Todas as receitas de ${year}` },
    { tipo: "despesas", t: "Relatório de despesas", d: `Todas as despesas de ${year}` },
    { tipo: "completo", t: "Relatório completo", d: `Prestação de contas ${year} com metas` },
  ] as const;
  if (!can("export_financial_reports")) return <p className="mt-4 text-sm text-muted-foreground">Você pode ver os indicadores na aba Resumo. Para gerar relatórios, peça a permissão de exportação.</p>;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <Link key={i.tipo} to="/painel/relatorio" search={{ tipo: i.tipo, ano: year, mes: month }} className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-soft">
          <FileText className="h-6 w-6 text-primary" />
          <p className="mt-3 font-semibold text-foreground">{i.t}</p>
          <p className="text-sm text-muted-foreground">{i.d}</p>
          <p className="mt-3 text-xs font-semibold text-primary">Abrir · PDF / CSV →</p>
        </Link>
      ))}
    </div>
  );
}
