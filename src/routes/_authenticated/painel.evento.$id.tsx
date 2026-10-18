import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, CameraOff, Download, ExternalLink, Volume2, VolumeX } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventForm, draftFrom } from "@/components/events/EventForm";
import { QrScanner, type ScanFeedbackKind } from "@/components/events/QrScanner";
import { formatShortCode } from "@/lib/images";
import { playRead, playWarning, unlockAudio } from "@/lib/sounds";
import { downloadXls } from "@/lib/export";
import { eventError, fmtDateTime, moneyBR, PAYMENT_STATUS, REGISTRATION_STATUS, TICKET_STATUS } from "@/lib/events";
import { siteMeta } from "@/lib/site-query";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/painel/evento/$id")({
  head: () => siteMeta("Evento — Comunidade Aava", "Gestão do evento."),
  component: EventAdmin,
});

type Stats = {
  registrations: number; tickets_total: number; checked_in: number;
  expected_total: number; paid_total: number; claimed_total: number;
  lots: { name: string; capacity: number | null; sold: number }[];
};

function EventAdmin() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can, isLoading } = useAccess();
  const canManage = can("manage_events");
  const canVerify = canManage || can("verify_event_payments");
  const canCheckin = canManage || can("checkin_events");
  const allowed = canManage || canVerify || canCheckin;

  const event = useQuery({
    queryKey: ["admin-event", id],
    enabled: allowed,
    queryFn: async () => {
      const [e, lots, info] = await Promise.all([
        supabase.from("events").select("*").eq("id", id).maybeSingle(),
        supabase.from("event_lots").select("*").eq("event_id", id).order("position"),
        supabase.from("event_payment_info").select("*").eq("event_id", id).maybeSingle(),
      ]);
      return e.data ? { event: e.data, lots: lots.data ?? [], info: info.data } : null;
    },
  });
  const stats = useQuery({
    queryKey: ["admin-event-stats", id],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("event_admin_stats", { _event: id });
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-event-stats", id] });
    qc.invalidateQueries({ queryKey: ["admin-regs", id] });
    qc.invalidateQueries({ queryKey: ["admin-tickets", id] });
    qc.invalidateQueries({ queryKey: ["public-events"] });
  };

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento excluído");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      qc.invalidateQueries({ queryKey: ["public-events"] });
      navigate({ to: "/painel/eventos" });
    },
    onError: (e) => toast.error(eventError(e)),
  });

  if (isLoading || event.isLoading) return null;
  if (!allowed) return <p className="text-muted-foreground">Você não tem acesso a esta área.</p>;
  const data = event.data;
  if (!data) {
    return (
      <div className="space-y-4">
        <Link to="/painel/eventos" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        <p className="text-muted-foreground">Evento não encontrado.</p>
      </div>
    );
  }
  const e = data.event;

  return (
    <div>
      <Link to="/painel/eventos" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar para eventos</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl text-foreground">{e.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(e.starts_at)}{e.location ? ` · ${e.location}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={e.published ? "default" : "secondary"}>{e.published ? "Publicado" : "Rascunho"}</Badge>
            {e.audience === "members" && <Badge variant="outline">Só membros</Badge>}
          </div>
        </div>
        {e.published && (
          <Button asChild variant="outline" size="sm"><Link to="/eventos/$slug" params={{ slug: e.slug }}><ExternalLink className="h-4 w-4" /> Ver página pública</Link></Button>
        )}
      </div>

      <Tabs defaultValue="resumo" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          {canVerify && <TabsTrigger value="inscricoes">Inscrições</TabsTrigger>}
          {canCheckin && <TabsTrigger value="checkin">Check-in</TabsTrigger>}
          {canManage && <TabsTrigger value="editar">Editar</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumo"><Summary stats={stats.data} loading={stats.isLoading} /></TabsContent>
        {canVerify && <TabsContent value="inscricoes"><Registrations eventId={id} title={e.title} onChange={refreshAll} /></TabsContent>}
        {canCheckin && <TabsContent value="checkin"><CheckIn eventId={id} onChange={refreshAll} /></TabsContent>}
        {canManage && (
          <TabsContent value="editar">
            <div className="mt-4 max-w-2xl">
              <EventForm key={e.id + (event.dataUpdatedAt ?? 0)} initial={draftFrom(e, data.lots, data.info)} onSaved={() => event.refetch()} />
              <div className="mt-10 rounded-xl border border-destructive/30 p-4">
                <p className="text-sm font-medium text-foreground">Excluir evento</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(stats.data?.registrations ?? 0) > 0
                    ? "Este evento já tem inscrições. Para tirá-lo do site, desmarque “Publicar evento” em vez de excluir."
                    : "Remove o evento e seus lotes. Só é possível enquanto não houver inscrições."}
                </p>
                <Button className="mt-3" variant="outline" disabled={(stats.data?.registrations ?? 0) > 0 || del.isPending} onClick={() => confirm("Excluir este evento?") && del.mutate()}>Excluir evento</Button>
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/* ------------------------------ Resumo + gráficos ------------------------------ */
function Summary({ stats, loading }: { stats: Stats | undefined; loading: boolean }) {
  if (loading || !stats) return <p className="mt-4 text-muted-foreground">Carregando...</p>;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const attendance = pct(stats.checked_in, stats.tickets_total);
  const paidPct = pct(stats.paid_total, stats.expected_total);
  const pending = Math.max(0, stats.expected_total - stats.paid_total - stats.claimed_total);
  const attendanceData = [
    { name: "Presentes", value: stats.checked_in },
    { name: "Ainda não compareceram", value: Math.max(0, stats.tickets_total - stats.checked_in) },
  ];
  const payData = [{ name: "Pagamentos", Pago: stats.paid_total, "Aguardando verificação": stats.claimed_total, Pendente: pending }];

  return (
    <div className="mt-4 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[["Inscrições", stats.registrations], ["Ingressos emitidos", stats.tickets_total], ["Presentes", stats.checked_in]].map(([l, v]) => (
          <div key={String(l)} className="rounded-2xl border bg-card p-5"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 text-3xl font-semibold text-foreground">{v}</p></div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold text-foreground">Quem compareceu</p>
          <p className="text-sm text-muted-foreground">{stats.checked_in} de {stats.tickets_total} ingressos ({attendance}%)</p>
          <div className="mt-2 h-56">
            {stats.tickets_total === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">Ainda não há ingressos emitidos.</p>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={attendanceData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    <Cell fill="var(--primary)" />
                    <Cell fill="var(--muted-foreground)" fillOpacity={0.35} />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold text-foreground">Pagamentos</p>
          {stats.expected_total === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma inscrição com pagamento ainda.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Pago {moneyBR(stats.paid_total)} de {moneyBR(stats.expected_total)} ({paidPct}%)</p>
              <div className="mt-2 h-44">
                <ResponsiveContainer>
                  <BarChart data={payData} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" domain={[0, stats.expected_total]} tickFormatter={(v: number) => moneyBR(v)} fontSize={11} stroke="var(--muted-foreground)" />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip formatter={(v: number) => moneyBR(v)} />
                    <Legend />
                    <Bar dataKey="Pago" stackId="a" fill="var(--primary)" />
                    <Bar dataKey="Aguardando verificação" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="Pendente" stackId="a" fill="var(--muted-foreground)" fillOpacity={0.35} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {stats.lots.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <p className="font-semibold text-foreground">Vagas por lote</p>
          <div className="mt-2 h-60">
            <ResponsiveContainer>
              <BarChart data={stats.lots.map((l) => ({ name: l.name, Vendidas: l.sold, Restantes: l.capacity === null ? 0 : Math.max(0, l.capacity - l.sold) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Legend />
                <Bar dataKey="Vendidas" stackId="v" fill="var(--primary)" />
                <Bar dataKey="Restantes" stackId="v" fill="var(--muted-foreground)" fillOpacity={0.35} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Inscrições ------------------------------ */
function Registrations({ eventId, title, onChange }: { eventId: string; title: string; onChange: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const regs = useQuery({
    queryKey: ["admin-regs", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registrations")
        .select("*, event_lots(name), event_payments(*), event_tickets(*)")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const list = (regs.data ?? []).filter((r) => {
    const hasClaimed = (r.event_payments ?? []).some((p) => p.status === "claimed");
    if (filter === "aguardando" && !(r.status === "pending" && hasClaimed)) return false;
    if (filter === "pendentes" && r.status !== "pending") return false;
    if (filter === "confirmadas" && r.status !== "confirmed") return false;
    if (filter === "canceladas" && r.status !== "cancelled") return false;
    return !search || r.attendee_name.toLowerCase().includes(search.toLowerCase()) || (r.attendee_cpf ?? "").includes(search.replace(/\D/g, "") || "§");
  });
  const open = (regs.data ?? []).find((r) => r.id === openId) ?? null;

  function exportXls() {
    const head = ["Nome", "CPF", "Telefone", "E-mail", "Lote", "Quantidade", "Total (R$)", "Parcelas pagas", "Situação", "Inscrito em"];
    const rows = list.map((r) => [
      r.attendee_name, r.attendee_cpf ?? "", r.attendee_phone ?? "", r.attendee_email ?? "", r.event_lots?.name ?? "", r.quantity, Number(r.total),
      `${(r.event_payments ?? []).filter((p) => p.status === "paid").length}/${(r.event_payments ?? []).length}`,
      REGISTRATION_STATUS[r.status] ?? r.status, fmtDateTime(r.created_at),
    ]);
    downloadXls(`inscricoes-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, [head, ...rows], "Inscrições");
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><Label>Buscar</Label><Input placeholder="Nome ou CPF" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" /></div>
        <div className="space-y-1.5">
          <Label>Situação</Label>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="aguardando">Aguardando verificação</SelectItem>
              <SelectItem value="pendentes">Aguardando pagamento</SelectItem>
              <SelectItem value="confirmadas">Confirmadas</SelectItem>
              <SelectItem value="canceladas">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={exportXls} className="ml-auto"><Download className="h-4 w-4" /> XLS</Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr><th className="p-4 font-medium">Nome</th><th className="p-4 font-medium">Lote</th><th className="p-4 font-medium">Total</th><th className="p-4 font-medium">Pagamento</th><th className="p-4 font-medium">Situação</th><th className="p-4" /></tr>
          </thead>
          <tbody>
            {regs.isLoading && <tr><td className="p-4 text-muted-foreground" colSpan={6}>Carregando...</td></tr>}
            {!regs.isLoading && list.length === 0 && <tr><td className="p-6 text-center text-muted-foreground" colSpan={6}>Nenhuma inscrição encontrada.</td></tr>}
            {list.map((r) => {
              const pays = r.event_payments ?? [];
              const paid = pays.filter((p) => p.status === "paid").length;
              const claimed = pays.filter((p) => p.status === "claimed").length;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-4"><p className="font-medium text-foreground">{r.attendee_name}</p><p className="text-xs text-muted-foreground">{r.attendee_phone}</p></td>
                  <td className="p-4 text-muted-foreground">{r.event_lots?.name} × {r.quantity}</td>
                  <td className="p-4 text-foreground">{r.total > 0 ? moneyBR(r.total) : "Gratuito"}</td>
                  <td className="p-4 text-muted-foreground">
                    {pays.length === 0 ? "—" : `${paid}/${pays.length} pagas`}
                    {claimed > 0 && r.status === "pending" && <Badge className="ml-2" variant="outline">{claimed} p/ verificar</Badge>}
                  </td>
                  <td className="p-4"><Badge variant={r.status === "confirmed" ? "default" : "secondary"}>{REGISTRATION_STATUS[r.status] ?? r.status}</Badge></td>
                  <td className="p-4 text-right"><Button size="sm" variant="outline" onClick={() => setOpenId(r.id)}>Gerenciar</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          {open && <RegistrationDetail reg={open} onChange={() => { regs.refetch(); onChange(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type RegRow = Tables<"event_registrations"> & {
  event_lots: { name: string } | null;
  event_payments: Tables<"event_payments">[] | null;
  event_tickets: Tables<"event_tickets">[] | null;
};

function RegistrationDetail({ reg, onChange }: { reg: RegRow; onChange: () => void }) {
  const pays = [...(reg.event_payments ?? [])].sort((a, b) => a.installment_no - b.installment_no);
  const tickets = [...(reg.event_tickets ?? [])].sort((a, b) => a.seq - b.seq);
  const run = useMutation({
    mutationFn: async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await fn();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Atualizado"); onChange(); },
    onError: (e) => toast.error(eventError(e)),
  });
  async function openProof(path: string) {
    const { data } = await supabase.storage.from("event-proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <>
      <DialogHeader><DialogTitle>{reg.attendee_name}</DialogTitle></DialogHeader>
      <div className="space-y-5 text-sm">
        <div className="grid gap-1 text-muted-foreground">
          <p>{reg.event_lots?.name} × {reg.quantity} · {reg.total > 0 ? moneyBR(reg.total) : "Gratuito"}</p>
          <p>CPF: {reg.attendee_cpf || "—"} · Tel.: {reg.attendee_phone || "—"}</p>
          <p>{reg.attendee_email}</p>
          <p>Inscrito em {fmtDateTime(reg.created_at)}{reg.released_manually ? " · ingresso liberado manualmente" : ""}</p>
          <p><Badge variant={reg.status === "confirmed" ? "default" : "secondary"}>{REGISTRATION_STATUS[reg.status] ?? reg.status}</Badge></p>
        </div>

        {pays.length > 0 && (
          <div className="divide-y rounded-xl border">
            {pays.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium text-foreground">{pays.length > 1 ? `Parcela ${p.installment_no}/${pays.length}` : "Pagamento"} — {moneyBR(p.amount)}</p>
                  <Badge variant={p.status === "paid" ? "default" : "outline"} className="mt-1">{PAYMENT_STATUS[p.status] ?? p.status}</Badge>
                  {p.claimed_at && p.status !== "paid" && <span className="ml-2 text-xs text-muted-foreground">avisou em {fmtDateTime(p.claimed_at)}</span>}
                  {p.proof_path && <button type="button" className="ml-3 text-xs text-primary underline" onClick={() => openProof(p.proof_path!)}>Ver comprovante</button>}
                </div>
                {reg.status !== "cancelled" && (
                  <div className="flex gap-2">
                    {p.status !== "paid" && <Button size="sm" disabled={run.isPending} onClick={() => run.mutate(() => supabase.rpc("set_event_payment_status", { _payment: p.id, _status: "paid" }))}>Confirmar pagamento</Button>}
                    {p.status !== "pending" && reg.status === "pending" && <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(() => supabase.rpc("set_event_payment_status", { _payment: p.id, _status: "pending" }))}>Voltar p/ pendente</Button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tickets.length > 0 && (
          <div>
            <p className="font-medium text-foreground">Ingressos</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {tickets.map((t) => <li key={t.id}>{t.holder_name} — {TICKET_STATUS[t.status] ?? t.status}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {reg.status === "pending" && (
            <Button variant="secondary" disabled={run.isPending} onClick={() => confirm("Liberar o ingresso mesmo sem o pagamento completo?") && run.mutate(() => supabase.rpc("release_event_registration", { _reg: reg.id }))}>
              Liberar ingresso sem pagamento
            </Button>
          )}
          {reg.status !== "cancelled" && (
            <Button variant="outline" disabled={run.isPending} onClick={() => confirm("Cancelar esta inscrição? Os ingressos serão invalidados.") && run.mutate(() => supabase.rpc("cancel_event_registration", { _reg: reg.id }))}>
              Cancelar inscrição
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Check-in ------------------------------ */
type ScanResult = { result: "ok" | "already" | "invalid" | "cancelled"; holder_name?: string; lot?: string; event_title?: string; checked_in_at?: string; short_code?: string };

function CheckIn({ eventId, onChange }: { eventId: string; onChange: () => void }) {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [last, setLast] = useState<ScanResult | null>(null);
  const [search, setSearch] = useState("");
  const [sound, setSound] = useState(true);
  const [feedback, setFeedback] = useState<{ kind: ScanFeedbackKind; id: number } | null>(null);

  // O sinal no centro da câmera some sozinho
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1500);
    return () => clearTimeout(t);
  }, [feedback]);

  const tickets = useQuery({
    queryKey: ["admin-tickets", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_tickets").select("*").eq("event_id", eventId).neq("status", "cancelled").order("holder_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function check(code: string, source: "camera" | "manual") {
    // Câmera: o "certinho" e o som aparecem assim que o QR é lido, antes da resposta do servidor.
    if (source === "camera") {
      setFeedback({ kind: "ok", id: Date.now() });
      if (sound) playRead();
    }
    const { data, error } = await supabase.rpc("checkin_ticket", { _code: code.trim() });
    if (error) {
      toast.error(eventError(error));
      setFeedback({ kind: "error", id: Date.now() });
      if (sound) playWarning();
      return;
    }
    const res = data as unknown as ScanResult;
    setLast(res);
    if (res.result === "ok") {
      if (source === "manual" && sound) playRead();
      qc.invalidateQueries({ queryKey: ["admin-tickets", eventId] });
      onChange();
    } else {
      setFeedback({ kind: res.result === "already" ? "warn" : "error", id: Date.now() });
      if (sound) playWarning();
    }
  }
  const toggle = useMutation({
    mutationFn: async ({ id, present }: { id: string; present: boolean }) => {
      const { error } = await supabase.rpc("set_ticket_presence", { _ticket: id, _present: present });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tickets", eventId] }); onChange(); },
    onError: (e) => toast.error(eventError(e)),
  });

  const all = tickets.data ?? [];
  const present = all.filter((t) => t.status === "checked_in").length;
  const shown = all.filter((t) => !search || t.holder_name.toLowerCase().includes(search.toLowerCase()) || t.short_code.toLowerCase().includes(search.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const tone = last?.result === "ok" ? "border-green-600/40 bg-green-600/10" : last?.result === "already" ? "border-amber-500/50 bg-amber-500/10" : "border-destructive/40 bg-destructive/10";
  const msg = { ok: "Presença registrada", already: "Este ingresso já foi usado", invalid: "Ingresso não encontrado", cancelled: "Ingresso cancelado ou ainda não liberado" };

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={scanning ? "outline" : "default"} onClick={() => { unlockAudio(); setScanning((s) => !s); }}>
            {scanning ? <><CameraOff className="h-4 w-4" /> Parar câmera</> : <><Camera className="h-4 w-4" /> Ler QR code</>}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => { unlockAudio(); setSound((v) => !v); }} aria-pressed={sound}>
            {sound ? <><Volume2 className="h-4 w-4" /> Som ligado</> : <><VolumeX className="h-4 w-4" /> Som desligado</>}
          </Button>
        </div>
        {scanning && <QrScanner onScan={(code) => check(code, "camera")} feedback={feedback?.kind ?? null} />}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { check(manual, "manual"); setManual(""); } }}>
          <Input placeholder="Código do ingresso (ex.: K7M2-9QXA)" value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          <Button type="submit" variant="secondary">Validar</Button>
        </form>
        {last && (
          <div className={`rounded-2xl border p-5 ${tone}`}>
            <p className="text-lg font-semibold text-foreground">{msg[last.result]}</p>
            {last.holder_name && <p className="mt-1 text-foreground">{last.holder_name}</p>}
            {last.short_code && <p className="font-mono text-sm tracking-widest text-muted-foreground">{formatShortCode(last.short_code)}</p>}
            {last.lot && <p className="text-sm text-muted-foreground">{last.lot}</p>}
            {last.result === "already" && last.checked_in_at && <p className="text-sm text-muted-foreground">Entrou em {fmtDateTime(last.checked_in_at)}</p>}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-foreground">Presentes: {present} de {all.length}</p>
          <Input placeholder="Buscar por nome ou código" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
        </div>
        <div className="mt-3 max-h-[28rem] divide-y overflow-y-auto rounded-2xl border bg-card">
          {tickets.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
          {!tickets.isLoading && shown.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum ingresso emitido.</p>}
          {shown.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <p className="font-medium text-foreground">{t.holder_name}</p>
                <p className="font-mono text-xs tracking-widest text-muted-foreground">{formatShortCode(t.short_code)}</p>
                <Badge variant={t.status === "checked_in" ? "default" : "outline"}>{TICKET_STATUS[t.status] ?? t.status}</Badge>
                {t.checked_in_at && <span className="ml-2 text-xs text-muted-foreground">{fmtDateTime(t.checked_in_at)}</span>}
              </div>
              <Button size="sm" variant={t.status === "checked_in" ? "outline" : "secondary"} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: t.id, present: t.status !== "checked_in" })}>
                {t.status === "checked_in" ? "Desfazer" : "Marcar presente"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
