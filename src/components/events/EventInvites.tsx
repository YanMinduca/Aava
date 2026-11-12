import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Link2, QrCode, Search, Share2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RELIGIONS, religionLabel } from "@/lib/event-data";
import { eventError, fmtDateTime, formatCpf, isValidCpf, cpfDigits, TICKET_STATUS } from "@/lib/events";
import { dateBR } from "@/lib/church";
import { useDebounced } from "@/lib/use-debounced";
import { formatShortCode } from "@/lib/images";
import { dataUrlToFile, renderTicketPng, ticketFileName } from "@/lib/ticket-image";

type Lot = { id: string; name: string };

/** Máscara de telefone brasileiro: (11) 90000-0000 ou (11) 0000-0000. */
function formatPhoneBR(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

type Invite = {
  registration_id: string;
  ticket_id: string | null;
  code: string | null;
  short_code: string | null;
  holder_name: string;
  cpf_end: string;
  birth_date: string | null;
  phone: string | null;
  religion: string | null;
  institution: string | null;
  linked_name: string | null;
  lot: string;
  registration_status: string;
  ticket_status: string | null;
  created_at: string;
  created_by_me: boolean;
};

type Account = { user_id: string; full_name: string; email: string | null; cpf_end: string };

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
  askReligion,
  onChange,
}: {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  lots: Lot[];
  /** O evento pergunta religião e instituição? (mesma regra da inscrição) */
  askReligion: boolean;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [religion, setReligion] = useState("");
  const [institution, setInstitution] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const debouncedSearch = useDebounced(accountSearch.trim(), 400);
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

  const accounts = useQuery({
    queryKey: ["invite-accounts", debouncedSearch],
    enabled: !account && debouncedSearch.length >= 3,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_invite_accounts", { _q: debouncedSearch });
      if (error) throw error;
      return (data ?? []) as unknown as Account[];
    },
  });

  const cpfOk = isValidCpf(cpf);
  const nameOk = name.trim().replace(/\s+/g, " ").length >= 3;
  const birthOk = !!birth && birth <= new Date().toISOString().slice(0, 10) && birth >= "1900-01-01";
  const phoneOk = phone.replace(/\D/g, "").length >= 10 && phone.replace(/\D/g, "").length <= 13;
  const religionOk = !askReligion || (!!religion && institution.trim().length > 0);
  const canSubmit = nameOk && birthOk && cpfOk && phoneOk && religionOk && !!lotId;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_event_invite", {
        _event: eventId,
        _lot: lotId,
        _name: name.trim().replace(/\s+/g, " "),
        _birth_date: birth,
        _cpf: cpfDigits(cpf),
        _phone: phone.trim(),
        ...(account ? { _user: account.user_id } : {}),
        ...(askReligion ? { _religion: religion, _institution: institution.trim().replace(/\s+/g, " ") } : {}),
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
      setPhone("");
      setReligion("");
      setInstitution("");
      setAccount(null);
      setAccountSearch("");
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
        <div className="space-y-1.5">
          <Label htmlFor="invite-phone">Telefone / WhatsApp</Label>
          <Input id="invite-phone" type="tel" inputMode="tel" placeholder="(11) 90000-0000" value={phone} onChange={(e) => setPhone(formatPhoneBR(e.target.value))} autoComplete="off" maxLength={16} />
          {phone && !phoneOk && <p className="text-xs text-destructive">Informe o telefone com DDD.</p>}
        </div>
        {askReligion && (
          <>
            <div className="space-y-1.5">
              <Label>Religião</Label>
              <Select value={religion} onValueChange={setReligion}>
                <SelectTrigger><SelectValue placeholder="Escolha a religião" /></SelectTrigger>
                <SelectContent>
                  {RELIGIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-institution">Instituição religiosa</Label>
              <Input id="invite-institution" maxLength={120} placeholder='Ex.: nome da igreja, paróquia, centro… ou "Nenhuma"' value={institution} onChange={(e) => setInstitution(e.target.value)} autoComplete="off" />
            </div>
          </>
        )}
        <div className="space-y-1.5 rounded-xl border border-dashed p-3">
          <Label htmlFor="invite-account" className="flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-primary" aria-hidden /> Vincular a uma conta (opcional)
          </Label>
          {account ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-primary-soft px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{account.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{[account.email, account.cpf_end ? `CPF final ${account.cpf_end}` : null].filter(Boolean).join(" · ")}</p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Remover vínculo" onClick={() => setAccount(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="invite-account" className="pl-9" placeholder="Buscar por nome, CPF, telefone ou e-mail" value={accountSearch} onChange={(e) => setAccountSearch(e.target.value)} autoComplete="off" />
              </div>
              {debouncedSearch.length >= 3 && accountSearch.trim().length >= 3 && (
                <div className="divide-y rounded-lg border bg-background text-sm">
                  {accounts.isFetching && <p className="p-3 text-muted-foreground">Buscando...</p>}
                  {!accounts.isFetching && accounts.isError && <p className="p-3 text-destructive">Não foi possível buscar. Tente de novo.</p>}
                  {!accounts.isFetching && !accounts.isError && (accounts.data ?? []).length === 0 && <p className="p-3 text-muted-foreground">Nenhuma conta encontrada.</p>}
                  {!accounts.isFetching && (accounts.data ?? []).map((a) => (
                    <button key={a.user_id} type="button" className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => { setAccount(a); setAccountSearch(""); }}>
                      <span className="block truncate font-medium text-foreground">{a.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[a.email, a.cpf_end ? `CPF final ${a.cpf_end}` : null].filter(Boolean).join(" · ")}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {account ? "A pessoa vai ver este ingresso em “Meus ingressos” ao entrar no painel." : "Sem vínculo, o ingresso fica só com você, para salvar a imagem e enviar."}
          </p>
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
                  {(i.phone || i.religion || i.institution) && (
                    <p className="text-xs text-muted-foreground">
                      {[i.phone, i.religion ? religionLabel(i.religion) : null, i.institution].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {i.linked_name && <p className="text-xs text-muted-foreground">Vinculado à conta de {i.linked_name}</p>}
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
