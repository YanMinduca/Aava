import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, QrCode, Share2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { eventError, fmtDateTime, formatCpf, isValidCpf, cpfDigits, TICKET_STATUS } from "@/lib/events";
import { dateBR } from "@/lib/church";
import { formatShortCode } from "@/lib/images";
import { dataUrlToFile, renderTicketPng, ticketFileName } from "@/lib/ticket-image";

type Lot = { id: string; name: string };

type Invite = {
  registration_id: string;
  ticket_id: string | null;
  code: string | null;
  short_code: string | null;
  holder_name: string;
  cpf_end: string;
  birth_date: string | null;
  lot: string;
  registration_status: string;
  ticket_status: string | null;
  created_at: string;
  created_by_me: boolean;
};

type Shown = { code: string; holderName: string; shortCode: string; lotName: string };

/** Ingresso pronto para salvar/enviar: imagem com o nome do dono e o QR code. */
function TicketImageDialog({
  shown,
  eventTitle,
  eventDate,
  onClose,
}: {
  shown: Shown | null;
  eventTitle: string;
  eventDate: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl("");
    setFailed(false);
    if (!shown) return;
    let cancelled = false;
    renderTicketPng({
      code: shown.code,
      holderName: shown.holderName,
      eventTitle,
      eventDate,
      shortCode: shown.shortCode,
      lotName: shown.lotName,
    })
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [shown, eventTitle, eventDate]);

  const filename = ticketFileName(shown?.holderName ?? "");

  async function share() {
    try {
      const file = await dataUrlToFile(url, filename);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Ingresso — ${eventTitle}` });
        return;
      }
      toast.info("Este aparelho não abre o compartilhamento. Use “Salvar imagem” e envie a foto pelo WhatsApp.");
    } catch (e) {
      // Fechar o menu de compartilhar não é erro.
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("Não foi possível compartilhar. Use “Salvar imagem”.");
    }
  }

  return (
    <Dialog open={!!shown} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ingresso de {shown?.holderName}</DialogTitle>
          <DialogDescription>Salve a imagem e envie para a pessoa. O QR code é lido na entrada do evento.</DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">Não foi possível gerar a imagem. Tente de novo.</p>
        ) : url ? (
          <img src={url} alt={`Ingresso de ${shown?.holderName}`} className="mx-auto w-full max-w-xs rounded-lg border" data-testid="invite-ticket-image" />
        ) : (
          <div className="mx-auto aspect-[900/1340] w-full max-w-xs animate-pulse rounded-lg bg-muted" />
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild disabled={!url}>
            <a href={url || undefined} download={filename} aria-disabled={!url}>
              <Download className="h-4 w-4" /> Salvar imagem
            </a>
          </Button>
          <Button type="button" variant="outline" disabled={!url} onClick={share}>
            <Share2 className="h-4 w-4" /> Compartilhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Aba "Convites": cria ingresso para quem não tem conta (nome, nascimento e CPF) e lista os convites do evento. */
export function EventInvites({
  eventId,
  eventTitle,
  eventDate,
  lots,
  onChange,
}: {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  lots: Lot[];
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [cpf, setCpf] = useState("");
  const [lotId, setLotId] = useState(lots[0]?.id ?? "");
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!lotId && lots[0]) setLotId(lots[0].id);
  }, [lots, lotId]);

  const invites = useQuery({
    queryKey: ["event-invites", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_event_invites", { _event: eventId });
      if (error) throw error;
      return (data ?? []) as unknown as Invite[];
    },
  });

  const cpfOk = isValidCpf(cpf);
  const nameOk = name.trim().replace(/\s+/g, " ").length >= 3;
  const birthOk = !!birth && birth <= new Date().toISOString().slice(0, 10) && birth >= "1900-01-01";
  const canSubmit = nameOk && birthOk && cpfOk && !!lotId;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_event_invite", {
        _event: eventId,
        _lot: lotId,
        _name: name.trim().replace(/\s+/g, " "),
        _birth_date: birth,
        _cpf: cpfDigits(cpf),
      });
      if (error) throw error;
      return data as unknown as { holder_name: string; code: string; short_code: string };
    },
    onSuccess: (res) => {
      toast.success("Ingresso criado");
      setShown({
        code: res.code,
        holderName: res.holder_name,
        shortCode: res.short_code,
        lotName: lots.find((l) => l.id === lotId)?.name ?? "",
      });
      setName("");
      setBirth("");
      setCpf("");
      qc.invalidateQueries({ queryKey: ["event-invites", eventId] });
      qc.invalidateQueries({ queryKey: ["admin-regs", eventId] });
      onChange();
    },
    onError: (e) => toast.error(eventError(e)),
  });

  return (
    <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <form
        className="space-y-4 rounded-2xl border bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !create.isPending) create.mutate();
        }}
      >
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
            <UserPlus className="h-5 w-5 text-primary" aria-hidden /> Criar ingresso
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Para quem não tem conta ou e-mail. O ingresso sai em nome da pessoa, com QR code, e você salva a imagem para enviar.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Nome completo</Label>
          <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-birth">Data de nascimento</Label>
          <Input id="invite-birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-cpf">CPF</Label>
          <Input id="invite-cpf" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} autoComplete="off" />
          {cpf && !cpfOk && cpfDigits(cpf).length === 11 && <p className="text-xs text-destructive">CPF inválido. Confira os números.</p>}
        </div>
        {lots.length > 1 && (
          <div className="space-y-1.5">
            <Label>Lote</Label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger><SelectValue placeholder="Escolha o lote" /></SelectTrigger>
              <SelectContent>
                {lots.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="submit" className="w-full" disabled={!canSubmit || create.isPending}>
          {create.isPending ? "Criando..." : "Criar ingresso e gerar QR code"}
        </Button>
        <p className="text-xs text-muted-foreground">O convite ocupa 1 vaga do lote e não gera cobrança.</p>
      </form>

      <div>
        <h2 className="text-lg font-medium text-foreground">Convites criados</h2>
        <div className="mt-3 divide-y rounded-2xl border bg-card">
          {invites.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
          {!invites.isLoading && (invites.data ?? []).length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum convite criado neste evento.</p>
          )}
          {(invites.data ?? []).map((i) => {
            const cancelled = i.registration_status === "cancelled" || i.ticket_status === "cancelled";
            return (
              <div key={i.registration_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{i.holder_name}</p>
                  <p className="text-xs text-muted-foreground">
                    CPF final {i.cpf_end} · nasc. {dateBR(i.birth_date)} · {i.lot} · {fmtDateTime(i.created_at)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant={cancelled ? "secondary" : "outline"}>
                      {cancelled ? "Cancelado" : TICKET_STATUS[i.ticket_status ?? ""] ?? "—"}
                    </Badge>
                    {i.short_code && <Badge variant="outline" className="font-mono">{formatShortCode(i.short_code)}</Badge>}
                  </div>
                </div>
                {!cancelled && i.code && i.ticket_status === "valid" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShown({ code: i.code!, holderName: i.holder_name, shortCode: i.short_code ?? "", lotName: i.lot })}
                  >
                    <QrCode className="h-4 w-4" /> Ver ingresso
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <TicketImageDialog shown={shown} eventTitle={eventTitle} eventDate={eventDate} onClose={() => setShown(null)} />
    </div>
  );
}
