import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Baby, CheckCircle2, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHILD_MAX_AGE,
  DEFAULT_CHILD_NOTICE,
  eventError,
  fmtDate,
  formatCpf,
  isValidCpf,
  lotBlockReason,
  moneyBR,
  parseChildAge,
  registrationIsOpen,
  type PublicEventDetail,
} from "@/lib/events";

/**
 * "Inscrever meu filho": opção do evento (liga/desliga na edição do evento).
 * Fica sempre visível para quem está logado, mesmo depois de o responsável (ou outro filho) já ter sido inscrito.
 * Cada criança ocupa uma vaga do lote e recebe um ingresso próprio com QR code.
 */
export function ChildRegistration({ detail }: { detail: PublicEventDetail }) {
  if (!detail.event.allow_child_registration || !registrationIsOpen(detail.event)) return null;
  return <ChildRegistrationBox detail={detail} />;
}

function ChildRegistrationBox({ detail }: { detail: PublicEventDetail }) {
  const { event, lots } = detail;
  const qc = useQueryClient();
  const { data: access } = useAccess();
  const uid = access?.uid;
  const notice = event.child_registration_notice?.trim() || DEFAULT_CHILD_NOTICE;

  const profile = useQuery({
    queryKey: ["event-child-profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("members")
        .select("id, full_name, status, approval_status")
        .eq("user_id", uid!)
        .maybeSingle();
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [lotId, setLotId] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [age, setAge] = useState("");
  const [installments, setInstallments] = useState(1);
  const [imageConsent, setImageConsent] = useState(false);
  const [last, setLast] = useState<{ name: string; paid: boolean } | null>(null);

  const isMember =
    profile.data?.approval_status === "aprovado" && profile.data?.status !== "visitante";
  const eligible = lots.filter((l) => !lotBlockReason(event, l, isMember));
  const selected = lots.find((l) => l.id === lotId);
  const payRequired = event.payment_enabled && (selected?.price ?? 0) > 0;

  useEffect(() => {
    if (!lotId || !eligible.some((l) => l.id === lotId)) setLotId(eligible[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, isMember]);
  useEffect(() => {
    if (!payRequired || !event.allow_installments) setInstallments(1);
  }, [payRequired, event.allow_installments]);

  const register = useMutation({
    mutationFn: async () => {
      if (name.trim().split(/\s+/).filter(Boolean).length < 2)
        throw new Error("invalid_child_name");
      const childAge = parseChildAge(age);
      if (childAge === null) throw new Error("invalid_child_age");
      if (!isValidCpf(cpf)) throw new Error("invalid_child_cpf");
      if (event.require_image_consent && !imageConsent) throw new Error("image_consent_required");
      const { error } = await supabase.rpc("register_child_for_event", {
        _event: event.id,
        _lot: lotId,
        _child_name: name.trim(),
        _child_cpf: cpf,
        _child_age: childAge,
        _installments: installments,
        _image_consent: event.require_image_consent && imageConsent,
      });
      if (error) throw error;
      return name.trim();
    },
    onSuccess: (childName) => {
      setLast({ name: childName, paid: payRequired });
      setName("");
      setCpf("");
      setAge("");
      setImageConsent(false);
      setInstallments(1);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["public-event", event.slug] });
      qc.invalidateQueries({ queryKey: ["public-events"] });
      qc.invalidateQueries({ queryKey: ["my-registrations"] });
    },
    onError: (e) => {
      toast.error(eventError(e));
      qc.invalidateQueries({ queryKey: ["public-event", event.slug] });
    },
  });

  // Só aparece para quem já está logado e tem cadastro (o formulário principal cuida de quem ainda não tem).
  if (!uid || profile.isLoading || !profile.data) return null;

  const noLots = eligible.length === 0;

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <Baby className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl text-foreground">Inscrever meu filho</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Para crianças de 0 a {CHILD_MAX_AGE} anos. Você pode inscrever mais de um filho.
          </p>
        </div>
      </div>

      <div
        className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100"
        role="note"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="whitespace-pre-line">{notice}</p>
      </div>

      {last && (
        <div
          className="mt-4 flex items-start gap-3 rounded-lg bg-primary-soft p-3 text-sm text-foreground"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Inscrição de {last.name} realizada!</p>
            <p className="mt-1 text-muted-foreground">
              {last.paid
                ? "Faça o pagamento e avise a igreja em “Meu cadastro”. O ingresso é liberado depois que o pagamento for conferido."
                : "O ingresso com QR code da criança já está disponível."}{" "}
              <Link
                to="/painel/meu-cadastro"
                search={{ convite: undefined }}
                className="text-primary underline"
              >
                Ver em Meu cadastro
              </Link>
            </p>
          </div>
        </div>
      )}

      {noLots ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Não há lotes disponíveis para inscrever uma criança agora (esgotados, fora do período ou
          exclusivos para membros).
        </p>
      ) : !open ? (
        <Button
          type="button"
          className="mt-4"
          variant={last ? "outline" : "default"}
          onClick={() => setOpen(true)}
        >
          <Baby className="h-4 w-4" /> {last ? "Inscrever outro filho" : "Inscrever meu filho"}
        </Button>
      ) : (
        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            register.mutate();
          }}
        >
          {lots.length > 1 && (
            <div className="space-y-2">
              <Label>Escolha o lote</Label>
              <RadioGroup value={lotId} onValueChange={setLotId} className="gap-2">
                {lots.map((l) => {
                  const blocked = lotBlockReason(event, l, isMember);
                  return (
                    <label
                      key={l.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${blocked ? "opacity-60" : "cursor-pointer"}`}
                    >
                      <span className="flex items-center gap-3">
                        <RadioGroupItem value={l.id} disabled={!!blocked} />
                        <span>
                          <span className="block font-medium text-foreground">{l.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {l.spots_left === null
                              ? "Vagas ilimitadas"
                              : `${l.spots_left} vagas restantes`}
                            {l.closes_at ? ` · até ${fmtDate(l.closes_at)}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold text-foreground">
                          {event.payment_enabled && l.price > 0 ? moneyBR(l.price) : "Gratuito"}
                        </span>
                        {blocked && <Badge variant="secondary">{blocked}</Badge>}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="child-name">Nome completo da criança *</Label>
            <Input
              id="child-name"
              required
              maxLength={120}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="child-cpf">CPF da criança *</Label>
              <Input
                id="child-cpf"
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                autoComplete="off"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="child-age">Idade da criança *</Label>
              <Input
                id="child-age"
                required
                type="number"
                inputMode="numeric"
                min={0}
                max={CHILD_MAX_AGE}
                placeholder={`0 a ${CHILD_MAX_AGE}`}
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Máximo de {CHILD_MAX_AGE} anos.</p>
            </div>
          </div>

          {payRequired && event.allow_installments && event.max_installments > 1 && (
            <div className="space-y-1.5">
              <Label>Forma de pagamento (Pix)</Label>
              <Select
                value={String(installments)}
                onValueChange={(v) => setInstallments(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: event.max_installments }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n === 1
                        ? `À vista — ${moneyBR(selected?.price ?? 0)}`
                        : `${n}x de ${moneyBR((selected?.price ?? 0) / n)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {event.require_image_consent && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-primary-soft/40 p-4 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={imageConsent}
                onCheckedChange={(on) => setImageConsent(on === true)}
                aria-required="true"
              />
              <span>
                <span className="block font-medium text-foreground">
                  Estou de acordo com o uso de imagem da criança *
                </span>
                <span className="block text-xs text-muted-foreground">
                  Como responsável, autorizo o uso da imagem (fotos e vídeos) da criança registrada
                  neste evento.
                </span>
              </span>
            </label>
          )}

          <p className="text-xs text-muted-foreground">
            Os dados da criança (nome, CPF e idade) são usados só para controlar a vaga e a entrada
            no evento.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Valor da inscrição da criança:{" "}
              <strong className="text-lg text-foreground">
                {payRequired ? moneyBR(selected?.price ?? 0) : "Gratuito"}
              </strong>
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={register.isPending}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={
                  register.isPending || !lotId || (event.require_image_consent && !imageConsent)
                }
              >
                Inscrever criança
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
