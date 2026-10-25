import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { siteMeta } from "@/lib/site-query";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/painel/notificacoes")({
  head: () => siteMeta("Avisos por notificação — Área de membros Aava", "Envie avisos por notificação push para os membros."),
  component: PanelNotifications,
});

type AudienceKind = "all" | "members" | "leadership" | "department";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Todos os aparelhos cadastrados",
  members: "Membros aprovados",
  leadership: "Liderança (CEO e pastor presidente)",
  department: "Departamento",
};

function PanelNotifications() {
  const { can, isLoading } = useAccess();
  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;
  if (!can("send_push")) return <p>Você não tem permissão para enviar avisos.</p>;
  return (
    <div>
      <h1 className="mb-2 text-3xl">Avisos por notificação</h1>
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
        Envia uma notificação para o celular e o computador de quem ativou os avisos, mesmo com o site fechado. Só recebe quem já ativou em “Meu cadastro”.
        Os avisos de novo evento, pagamento para conferir, cadastro para aprovar e pedido de oração saem sozinhos.
      </p>
      <Composer />
      <History />
    </div>
  );
}

function Composer() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AudienceKind>("members");
  const [dept, setDept] = useState("");

  const departments = useQuery({
    queryKey: ["push-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const audience = kind === "department" ? { type: "department", id: dept } : { type: kind };
      const { data, error } = await supabase.functions.invoke<{ recipients: number; devices: number; sent: number; failed: number; error?: string }>("push", {
        body: { action: "send", title: title.trim(), body: body.trim(), url: url.trim() || "/painel", audience },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        throw new Error(status === 429 ? "rate_limited" : status === 403 ? "forbidden" : "failed");
      }
      return data;
    },
    onSuccess: (r) => {
      setTitle("");
      setBody("");
      setUrl("");
      void qc.invalidateQueries({ queryKey: ["push-history"] });
      if (!r || r.devices === 0) toast.message("Aviso registrado, mas ninguém desse público ativou as notificações ainda.");
      else toast.success(`Enviado para ${r.sent} ${r.sent === 1 ? "aparelho" : "aparelhos"}${r.failed ? ` (${r.failed} falharam)` : ""}.`);
    },
    onError: (e: Error) =>
      toast.error(
        e.message === "rate_limited" ? "Limite de 10 avisos por hora atingido. Tente mais tarde." : e.message === "forbidden" ? "Você não tem permissão para enviar avisos." : "Não foi possível enviar o aviso agora.",
      ),
  });

  const ready = title.trim().length > 0 && (kind !== "department" || dept !== "");

  return (
    <form
      className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && confirm(`Enviar este aviso para: ${kind === "department" ? `departamento ${departments.data?.find((d) => d.id === dept)?.name ?? ""}` : AUDIENCE_LABEL[kind]}? Não dá para desfazer.`)) send.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="push-title-input">Título *</Label>
        <Input id="push-title-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Culto de domingo mudou de horário" />
        <p className="text-xs text-muted-foreground">{title.length}/80</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="push-body-input">Mensagem</Label>
        <Textarea id="push-body-input" value={body} maxLength={240} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Texto curto que aparece na notificação." />
        <p className="text-xs text-muted-foreground">{body.length}/240</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="push-url-input">Página que abre ao tocar (opcional)</Label>
        <Input id="push-url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/eventos/nome-do-evento (vazio abre o painel)" />
        <p className="text-xs text-muted-foreground">Precisa começar com “/”: só páginas deste site.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="push-audience">Quem recebe</Label>
        <select
          id="push-audience"
          value={kind}
          onChange={(e) => setKind(e.target.value as AudienceKind)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {(Object.keys(AUDIENCE_LABEL) as AudienceKind[]).map((k) => (
            <option key={k} value={k}>
              {AUDIENCE_LABEL[k]}
            </option>
          ))}
        </select>
        {kind === "department" && (
          <select aria-label="Departamento" value={dept} onChange={(e) => setDept(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Escolha o departamento…</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <Button type="submit" disabled={!ready || send.isPending}>
        <Send className="h-4 w-4" /> Enviar aviso
      </Button>
    </form>
  );
}

function History() {
  const q = useQuery({
    queryKey: ["push-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_notifications")
        .select("id, kind, title, body, audience, devices, sent, failed, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="font-display text-xl text-foreground">Últimos avisos enviados</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum aviso enviado ainda.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">{r.title}</p>
              {r.body && <p className="text-muted-foreground">{r.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {r.kind === "auto" ? "automático" : "manual"} ·{" "}
                {r.sent} de {r.devices} {r.devices === 1 ? "aparelho" : "aparelhos"}
                {r.failed > 0 ? ` (${r.failed} falharam)` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
