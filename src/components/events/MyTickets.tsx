import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Copy, Download, ExternalLink, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeLink } from "@/lib/site-content";
import { copyText } from "@/lib/clipboard";
import { compressImage, fileExt, formatShortCode } from "@/lib/images";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eventError, fmtDateTime, moneyBR, PAYMENT_STATUS, REGISTRATION_STATUS, TICKET_STATUS } from "@/lib/events";
import type { Tables } from "@/integrations/supabase/types";

function TicketQr({ code, name }: { code: string; name: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(code, { width: 280, margin: 1, errorCorrectionLevel: "M" }).then(setUrl);
  }, [code]);
  if (!url) return <div className="h-44 w-44 animate-pulse rounded-lg bg-muted" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={url} alt={`QR code do ingresso de ${name}`} className="h-44 w-44 rounded-lg border bg-white p-1" />
      <a href={url} download={`ingresso-${name.replace(/\s+/g, "-").toLowerCase()}.png`} className="inline-flex items-center gap-1 text-xs text-primary underline">
        <Download className="h-3 w-3" /> Salvar imagem
      </a>
    </div>
  );
}

/** Um ingresso: QR + código para digitar. Depois da presença confirmada, o QR some e fica só o aviso. */
export function TicketCard({ ticket, total }: { ticket: Tables<"event_tickets">; total: number }) {
  const checkedIn = ticket.status === "checked_in";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-background p-4 text-center">
      {checkedIn ? (
        <div className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg bg-primary-soft">
          <CheckCircle2 className="h-14 w-14 text-primary" aria-hidden />
          <p className="text-lg font-semibold text-foreground">Presença confirmada</p>
          {ticket.checked_in_at && <p className="text-xs text-muted-foreground">{fmtDateTime(ticket.checked_in_at)}</p>}
        </div>
      ) : ticket.status === "cancelled" ? (
        <div className="flex h-44 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">Ingresso cancelado</div>
      ) : (
        <>
          <TicketQr code={ticket.code} name={ticket.holder_name} />
          <div>
            <p className="font-mono text-xl font-semibold tracking-widest text-foreground" aria-label="Código do ingresso">
              {formatShortCode(ticket.short_code)}
            </p>
            <p className="text-xs text-muted-foreground">Se a câmera não ler, informe este código na entrada.</p>
          </div>
        </>
      )}
      <div>
        <p className="font-medium text-foreground">{ticket.holder_name}</p>
        <p className="text-xs text-muted-foreground">Ingresso {ticket.seq} de {total}</p>
        {!checkedIn && <Badge className="mt-2" variant="outline">{TICKET_STATUS[ticket.status] ?? ticket.status}</Badge>}
      </div>
    </div>
  );
}

function PaymentInstructions({ eventId }: { eventId: string }) {
  const info = useQuery({
    queryKey: ["event-payment-info", eventId],
    queryFn: async () => (await supabase.from("event_payment_info").select("*").eq("event_id", eventId).maybeSingle()).data,
  });
  const qr = useQuery({
    queryKey: ["event-qr", info.data?.pix_qr_path],
    enabled: !!info.data?.pix_qr_path,
    queryFn: async () => (await supabase.storage.from("event-assets").createSignedUrl(info.data!.pix_qr_path!, 3600)).data?.signedUrl ?? null,
  });
  const d = info.data;
  if (!d) return null;
  const link = d.payment_link ? safeLink(d.payment_link) : "";
  return (
    <div className="rounded-xl border bg-primary-soft p-4 text-sm">
      <p className="font-medium text-foreground">Como pagar</p>
      <div className="mt-3 flex flex-wrap items-start gap-6">
        {qr.data && <img src={qr.data} alt="QR code do pagamento" className="h-40 w-40 rounded-lg border bg-white p-1" />}
        <div className="space-y-3">
          {link && (
            <Button asChild size="sm"><a href={link} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" /> Pagar pelo link</a></Button>
          )}
          {d.pix_key && (
            <div>
              <p className="text-xs text-muted-foreground">Chave Pix</p>
              <p className="flex items-center gap-2 break-all font-mono text-foreground">
                {d.pix_key}
                <Button type="button" size="icon" variant="ghost" aria-label="Copiar chave Pix" onClick={async () => ((await copyText(d.pix_key!)) ? toast.success("Chave Pix copiada") : toast.error("Não foi possível copiar. Selecione a chave."))}><Copy className="h-4 w-4" /></Button>
              </p>
            </div>
          )}
          {d.card_contact_note && <p className="max-w-xs text-muted-foreground">{d.card_contact_note}</p>}
        </div>
      </div>
    </div>
  );
}

export function MyTickets({ uid }: { uid: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const regs = useQuery({
    queryKey: ["my-registrations", uid],
    // Enquanto houver ingresso válido, confere a cada 10 s se a presença já foi confirmada
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "confirmed" && (r.event_tickets ?? []).some((t) => t.status === "valid")) ? 10000 : false),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_registrations")
        .select("*, events(title, slug, starts_at, location), event_lots(name), event_payments(*), event_tickets(*)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-registrations", uid] });

  const claim = useMutation({
    mutationFn: async ({ paymentId, proofPath }: { paymentId: string; proofPath?: string }) => {
      const { error } = await supabase.rpc("claim_event_payment", proofPath ? { _payment: paymentId, _proof_path: proofPath } : { _payment: paymentId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pronto! A igreja vai conferir o pagamento.");
      refresh();
    },
    onError: (e) => toast.error(eventError(e)),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_event_registration", { _reg: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inscrição cancelada");
      refresh();
      qc.invalidateQueries({ queryKey: ["public-events"] });
    },
    onError: (e) => toast.error(eventError(e)),
  });

  async function onFile(file: File | undefined) {
    const paymentId = uploadFor;
    setUploadFor(null);
    if (!file || !paymentId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("O arquivo deve ter até 8 MB.");
      return;
    }
    const blob = await compressImage(file, { maxSide: 1800, quality: 0.8 });
    const path = `${uid}/${paymentId}-${Date.now()}.${fileExt(blob, file.name)}`;
    const { error } = await supabase.storage.from("event-proofs").upload(path, blob, { contentType: blob.type || file.type });
    if (error) {
      toast.error("Não foi possível enviar o comprovante.");
      return;
    }
    claim.mutate({ paymentId, proofPath: path });
  }

  async function openProof(path: string) {
    const { data } = await supabase.storage.from("event-proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  const list = regs.data ?? [];
  if (list.length === 0) return null;

  return (
    <section id="ingressos" className="mt-12">
      <h2 className="text-2xl text-foreground">Meus ingressos</h2>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="mt-5 space-y-6">
        {list.map((r) => {
          const payments = [...(r.event_payments ?? [])].sort((a, b) => a.installment_no - b.installment_no);
          const tickets = [...(r.event_tickets ?? [])].sort((a, b) => a.seq - b.seq);
          const canCancel = r.status === "pending" && !payments.some((p) => p.status !== "pending");
          return (
            <article key={r.id} className={`rounded-2xl border bg-card p-6 ${r.status === "cancelled" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl text-foreground">
                    {r.events ? <Link to="/eventos/$slug" params={{ slug: r.events.slug }} className="hover:underline">{r.events.title}</Link> : "Evento"}
                  </h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" /> {r.events ? fmtDateTime(r.events.starts_at) : ""}
                    {r.events?.location ? ` · ${r.events.location}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.event_lots?.name} · {r.quantity} {r.quantity === 1 ? "ingresso" : "ingressos"}
                    {r.total > 0 ? ` · ${moneyBR(r.total)}` : ""}
                  </p>
                </div>
                <Badge variant={r.status === "confirmed" ? "default" : "secondary"}>{REGISTRATION_STATUS[r.status] ?? r.status}</Badge>
              </div>

              {r.status === "pending" && (
                <div className="mt-5 space-y-4">
                  <PaymentInstructions eventId={r.event_id} />
                  <div className="divide-y rounded-xl border">
                    {payments.map((p) => (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                        <div>
                          <p className="font-medium text-foreground">
                            {payments.length > 1 ? `Parcela ${p.installment_no} de ${payments.length}` : "Pagamento"} — {moneyBR(p.amount)}
                          </p>
                          <Badge variant={p.status === "paid" ? "default" : "outline"} className="mt-1">{PAYMENT_STATUS[p.status] ?? p.status}</Badge>
                          {p.proof_path && (
                            <button type="button" className="ml-3 text-xs text-primary underline" onClick={() => openProof(p.proof_path!)}>Ver comprovante enviado</button>
                          )}
                        </div>
                        {p.status !== "paid" && (
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={claim.isPending} onClick={() => { setUploadFor(p.id); fileRef.current?.click(); }}>
                              <Upload className="h-4 w-4" /> Enviar comprovante
                            </Button>
                            {p.status === "pending" && (
                              <Button type="button" size="sm" disabled={claim.isPending} onClick={() => claim.mutate({ paymentId: p.id })}>Já efetuei o pagamento</Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">O ingresso é liberado depois que a igreja confirmar {payments.length > 1 ? "todas as parcelas" : "o pagamento"}.</p>
                  {canCancel && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => confirm("Cancelar esta inscrição?") && cancel.mutate(r.id)}>Cancelar inscrição</Button>
                  )}
                </div>
              )}

              {r.status === "confirmed" && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {tickets.map((t) => (
                    <TicketCard key={t.id} ticket={t} total={r.quantity} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
