import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  eventError, fmtDate, formatCpf, isValidCpf, lotIsOpen, moneyBR, registrationIsOpen,
  type PublicEventDetail, type PublicLot,
} from "@/lib/events";

const Box = ({ children }: { children: React.ReactNode }) => <div className="rounded-2xl border bg-card p-6 shadow-soft">{children}</div>;

export function EventRegistration({ detail }: { detail: PublicEventDetail }) {
  const { event, lots } = detail;
  const qc = useQueryClient();
  const { data: access, isLoading: loadingAccess } = useAccess();
  const uid = access?.uid;
  const nextPath = `/eventos/${event.slug}`;
  const visitorsAllowed = event.audience === "public" || lots.some((l) => l.public_access);

  const profile = useQuery({
    queryKey: ["event-profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("members")
        .select("id, full_name, cpf, phone, status, approval_status")
        .eq("user_id", uid!)
        .maybeSingle();
      return data;
    },
  });
  const mine = useQuery({
    queryKey: ["event-my-regs", uid, event.id],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase.from("event_registrations").select("id").eq("event_id", event.id).eq("user_id", uid!).neq("status", "cancelled");
      return data ?? [];
    },
  });

  const [done, setDone] = useState<{ paid: boolean } | null>(null);
  const [lotId, setLotId] = useState("");
  const [qty, setQty] = useState(1);
  const [cpf, setCpf] = useState("");
  const [installments, setInstallments] = useState(1);
  const [visitor, setVisitor] = useState({ name: "", cpf: "", phone: "" });

  useEffect(() => {
    if (profile.data?.cpf) setCpf(formatCpf(profile.data.cpf));
  }, [profile.data?.cpf]);
  useEffect(() => {
    if (!uid) return;
    supabase.auth.getUser().then(({ data }) => {
      const n = (data.user?.user_metadata?.['full_name'] as string | undefined) ?? "";
      if (n) setVisitor((v) => (v.name ? v : { ...v, name: n }));
    });
  }, [uid]);

  const createVisitor = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("ensure_visitor_profile", { _name: visitor.name, _cpf: visitor.cpf, _phone: visitor.phone });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados salvos! Agora é só escolher o ingresso.");
      qc.invalidateQueries({ queryKey: ["event-profile", uid] });
    },
    onError: (e) => toast.error(eventError(e)),
  });

  const isMember = profile.data?.approval_status === "aprovado" && profile.data?.status !== "visitante";
  const lotState = (l: PublicLot) => {
    if (event.audience === "members" && !isMember && !l.public_access) return "Só para membros";
    if (!lotIsOpen(l)) return "Fora do período";
    if (l.spots_left === 0) return "Esgotado";
    return null;
  };
  const selected = lots.find((l) => l.id === lotId);
  const payRequired = event.payment_enabled && (selected?.price ?? 0) > 0;
  const maxQty = Math.max(1, Math.min(10, selected?.spots_left ?? 10, event.limit_per_person ? (event.max_per_person ?? 10) : 10));
  const total = (selected?.price ?? 0) * qty;

  useEffect(() => {
    if (!lotId) {
      const first = lots.find((l) => !lotState(l));
      if (first) setLotId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, profile.data?.id]);
  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
    if (!payRequired || !event.allow_installments) setInstallments(1);
  }, [maxQty, qty, payRequired, event.allow_installments]);

  const register = useMutation({
    mutationFn: async () => {
      if (event.limit_per_person && !isValidCpf(cpf)) throw new Error("invalid_cpf");
      if (cpf && !isValidCpf(cpf)) throw new Error("invalid_cpf");
      const { error } = await supabase.rpc("register_for_event", {
        _event: event.id, _lot: lotId, _quantity: qty, _cpf: cpf, _installments: installments,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDone({ paid: payRequired });
      qc.invalidateQueries({ queryKey: ["public-event", event.slug] });
      qc.invalidateQueries({ queryKey: ["public-events"] });
      qc.invalidateQueries({ queryKey: ["event-my-regs"] });
      qc.invalidateQueries({ queryKey: ["my-registrations"] });
    },
    onError: (e) => {
      toast.error(eventError(e));
      qc.invalidateQueries({ queryKey: ["public-event", event.slug] });
    },
  });

  if (!registrationIsOpen(event)) {
    const early = event.registration_opens_at && new Date(event.registration_opens_at) > new Date();
    return (
      <Box>
        <h3 className="text-xl text-foreground">Inscrições {early ? "ainda não abriram" : "encerradas"}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {early ? `As inscrições abrem em ${fmtDate(event.registration_opens_at)}.` : "O período de inscrição deste evento terminou."}
        </p>
      </Box>
    );
  }

  if (loadingAccess) return <Box><p className="text-sm text-muted-foreground">Carregando...</p></Box>;

  if (!uid) {
    return (
      <Box>
        <h3 className="text-xl text-foreground">Quero me inscrever</h3>
        <p className="mt-2 text-sm text-muted-foreground">Você é membro da igreja ou visitante?</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/auth" search={{ next: nextPath }}>Sou membro</Link>
          </Button>
          {visitorsAllowed && (
            <Button asChild variant="outline">
              <Link to="/auth" search={{ next: nextPath, mode: "up" }}>Sou visitante</Link>
            </Button>
          )}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {visitorsAllowed
            ? "Membros entram com a conta de membro. Visitantes criam uma conta rápida e ficam salvos como visitantes."
            : "Este evento é exclusivo para membros: entre com a sua conta de membro."}
        </p>
      </Box>
    );
  }

  if (profile.isLoading) return <Box><p className="text-sm text-muted-foreground">Carregando...</p></Box>;

  if (!profile.data) {
    return (
      <Box>
        <h3 className="text-xl text-foreground">Complete seus dados</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Para se inscrever como visitante, precisamos de alguns dados. Você será salvo como visitante da igreja.
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidCpf(visitor.cpf)) {
              toast.error(eventError(new Error("invalid_cpf")));
              return;
            }
            createVisitor.mutate();
          }}
        >
          <div className="space-y-1.5"><Label>Nome completo *</Label><Input required value={visitor.name} onChange={(e) => setVisitor({ ...visitor, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>CPF *</Label><Input required inputMode="numeric" placeholder="000.000.000-00" value={visitor.cpf} onChange={(e) => setVisitor({ ...visitor, cpf: formatCpf(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Telefone / WhatsApp *</Label><Input required inputMode="tel" value={visitor.phone} onChange={(e) => setVisitor({ ...visitor, phone: e.target.value })} /></div>
          <Button type="submit" className="w-full" disabled={createVisitor.isPending}>Continuar</Button>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">
          Já é membro e ainda não fez seu cadastro? <Link to="/painel/meu-cadastro" search={{ convite: undefined }} className="text-primary underline">Faça em “Meu cadastro”</Link>.
        </p>
      </Box>
    );
  }

  if (done) {
    return (
      <Box>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h3 className="text-xl text-foreground">Inscrição realizada!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {done.paid
                ? "Agora faça o pagamento e avise a igreja pelo botão “Já efetuei o pagamento” (ou envie o comprovante). Seu ingresso é liberado depois que o pagamento for conferido."
                : "Seu ingresso com QR code já está disponível."}
            </p>
            <Button asChild className="mt-4"><Link to="/painel/meu-cadastro" search={{ convite: undefined }}>Ver em Meu cadastro</Link></Button>
          </div>
        </div>
      </Box>
    );
  }

  const eligible = lots.filter((l) => !lotState(l));
  if (eligible.length === 0) {
    return (
      <Box>
        <h3 className="text-xl text-foreground">Sem lotes disponíveis para você</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {event.audience === "members" && !isMember
            ? "Os lotes abertos agora são exclusivos para membros. Se você é membro, confira se o seu cadastro já foi aprovado."
            : "Todos os lotes estão esgotados ou fora do período."}
        </p>
      </Box>
    );
  }

  return (
    <Box>
      <h3 className="text-xl text-foreground">Inscrever-se</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Inscrevendo-se como <strong className="text-foreground">{profile.data.full_name}</strong> ({isMember ? "membro" : "visitante"}).
      </p>
      {(mine.data?.length ?? 0) > 0 && (
        <p className="mt-3 rounded-lg bg-primary-soft p-3 text-sm text-foreground">
          Você já tem inscrição neste evento. <Link to="/painel/meu-cadastro" search={{ convite: undefined }} className="text-primary underline">Ver em Meu cadastro</Link>
        </p>
      )}
      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate();
        }}
      >
        <div className="space-y-2">
          <Label>{lots.length > 1 ? "Escolha o lote" : "Ingresso"}</Label>
          <RadioGroup value={lotId} onValueChange={setLotId} className="gap-2">
            {lots.map((l) => {
              const blocked = lotState(l);
              return (
                <label key={l.id} className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${blocked ? "opacity-60" : "cursor-pointer"}`}>
                  <span className="flex items-center gap-3">
                    <RadioGroupItem value={l.id} disabled={!!blocked} />
                    <span>
                      <span className="block font-medium text-foreground">{l.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {l.spots_left === null ? "Vagas ilimitadas" : `${l.spots_left} vagas restantes`}
                        {l.closes_at ? ` · até ${fmtDate(l.closes_at)}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold text-foreground">{event.payment_enabled && l.price > 0 ? moneyBR(l.price) : "Gratuito"}</span>
                    {blocked && <Badge variant="secondary">{blocked}</Badge>}
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Quantidade de ingressos</Label>
            <Input type="number" min={1} max={maxQty} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))} />
            {event.limit_per_person && <p className="text-xs text-muted-foreground">Limite de {event.max_per_person} por pessoa (controlado pelo CPF).</p>}
          </div>
          <div className="space-y-1.5">
            <Label>CPF{event.limit_per_person ? " *" : " (opcional)"}</Label>
            <Input inputMode="numeric" placeholder="000.000.000-00" required={event.limit_per_person} value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
          </div>
        </div>

        {payRequired && event.allow_installments && event.max_installments > 1 && (
          <div className="space-y-1.5">
            <Label>Forma de pagamento (Pix)</Label>
            <Select value={String(installments)} onValueChange={(v) => setInstallments(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: event.max_installments }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? `À vista — ${moneyBR(total)}` : `${n}x de ${moneyBR(total / n)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            Total: <strong className="text-lg text-foreground">{payRequired ? moneyBR(total) : "Gratuito"}</strong>
          </p>
          <Button type="submit" size="lg" disabled={register.isPending || !lotId}>Inscrever-se</Button>
        </div>
      </form>
    </Box>
  );
}
