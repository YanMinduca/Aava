import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { eventError, fromLocalInput, slugify, toLocalInput } from "@/lib/events";
import { compressImage, fileExt } from "@/lib/images";
import type { Tables } from "@/integrations/supabase/types";

export type LotDraft = { id?: string; name: string; price: string; capacity: string; public_access: boolean; opens_at: string; closes_at: string };
export type EventDraft = {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  published: boolean;
  audience: "public" | "members";
  useLots: boolean;
  lots: LotDraft[];
  payment_enabled: boolean;
  payment_link: string;
  pix_key: string;
  pix_qr_path: string;
  accepts_card: boolean;
  card_contact_note: string;
  allow_installments: boolean;
  max_installments: string;
  limit_per_person: boolean;
  max_per_person: string;
  require_image_consent: boolean;
};

const SINGLE_LOT = "Ingresso";
const blankLot = (name = ""): LotDraft => ({ name, price: "0", capacity: "", public_access: true, opens_at: "", closes_at: "" });
export const blankEvent = (): EventDraft => ({
  title: "", description: "", location: "", starts_at: "", ends_at: "", registration_opens_at: "", registration_closes_at: "",
  published: false, audience: "public", useLots: false, lots: [blankLot(SINGLE_LOT)],
  payment_enabled: false, payment_link: "", pix_key: "", pix_qr_path: "", accepts_card: false,
  card_contact_note: "Para pagar no cartão, entre em contato com a igreja.",
  allow_installments: false, max_installments: "3", limit_per_person: false, max_per_person: "2",
  require_image_consent: false,
});

export function draftFrom(
  e: Tables<"events">,
  lots: Tables<"event_lots">[],
  info: Tables<"event_payment_info"> | null,
): EventDraft {
  const sorted = [...lots].sort((a, b) => a.position - b.position);
  const single = sorted.length === 1 && sorted[0]!.name === SINGLE_LOT;
  return {
    id: e.id, slug: e.slug, title: e.title, description: e.description ?? "", location: e.location ?? "",
    starts_at: toLocalInput(e.starts_at), ends_at: toLocalInput(e.ends_at),
    registration_opens_at: toLocalInput(e.registration_opens_at), registration_closes_at: toLocalInput(e.registration_closes_at),
    published: e.published, audience: e.audience === "members" ? "members" : "public", useLots: !single,
    lots: sorted.map((l) => ({
      id: l.id, name: l.name, price: String(l.price), capacity: l.capacity === null ? "" : String(l.capacity),
      public_access: l.public_access, opens_at: toLocalInput(l.opens_at), closes_at: toLocalInput(l.closes_at),
    })),
    payment_enabled: e.payment_enabled, payment_link: info?.payment_link ?? "", pix_key: info?.pix_key ?? "",
    pix_qr_path: info?.pix_qr_path ?? "", accepts_card: e.accepts_card,
    card_contact_note: info?.card_contact_note ?? "Para pagar no cartão, entre em contato com a igreja.",
    allow_installments: e.allow_installments, max_installments: String(Math.max(2, e.max_installments)),
    limit_per_person: e.limit_per_person, max_per_person: String(e.max_per_person ?? 2),
    require_image_consent: e.require_image_consent,
  };
}

function validate(d: EventDraft) {
  if (!d.title.trim()) return "Informe o nome do evento.";
  if (!d.starts_at) return "Informe a data e hora do evento.";
  if (d.ends_at && new Date(d.ends_at) < new Date(d.starts_at)) return "O término não pode ser antes do início.";
  if (d.registration_opens_at && d.registration_closes_at && new Date(d.registration_closes_at) < new Date(d.registration_opens_at))
    return "O fim das inscrições não pode ser antes do início.";
  const lots = d.useLots ? d.lots : d.lots.slice(0, 1);
  if (lots.length === 0) return "Cadastre pelo menos um lote.";
  for (const l of lots) {
    if (!l.name.trim()) return "Dê um nome para cada lote.";
    if (!(Number(l.price.replace(",", ".")) >= 0)) return `Preço inválido no lote “${l.name}”.`;
    if (l.capacity !== "" && !(Number.isInteger(Number(l.capacity)) && Number(l.capacity) >= 0)) return `Vagas inválidas no lote “${l.name}”.`;
  }
  if (d.payment_enabled) {
    if (!lots.some((l) => Number(l.price.replace(",", ".")) > 0)) return "Informe o preço do ingresso (maior que zero) ou desative o pagamento.";
    if (!d.payment_link.trim() && !d.pix_key.trim() && !d.pix_qr_path && !d.accepts_card)
      return "Informe como pagar: link, chave Pix, QR code ou pagamento no cartão.";
    if (d.allow_installments && !(Number(d.max_installments) >= 2 && Number(d.max_installments) <= 12)) return "O parcelamento deve ter entre 2 e 12 parcelas.";
  }
  if (d.limit_per_person && !(Number.isInteger(Number(d.max_per_person)) && Number(d.max_per_person) >= 1)) return "Informe quantas inscrições cada pessoa pode fazer.";
  return null;
}

async function saveEvent(d: EventDraft, userId: string | null | undefined, qrFile: File | null) {
  const lots = (d.useLots ? d.lots : d.lots.slice(0, 1).map((l) => ({ ...l, name: SINGLE_LOT }))).map((l, i) => ({
    ...l, position: i, price: Number(l.price.replace(",", ".")) || 0, capacity: l.capacity === "" ? null : Number(l.capacity),
  }));
  const base = {
    title: d.title.trim(), description: d.description.trim() || null, location: d.location.trim() || null,
    starts_at: fromLocalInput(d.starts_at)!, ends_at: fromLocalInput(d.ends_at),
    registration_opens_at: fromLocalInput(d.registration_opens_at), registration_closes_at: fromLocalInput(d.registration_closes_at),
    published: d.published, audience: d.audience, payment_enabled: d.payment_enabled, accepts_card: d.payment_enabled && d.accepts_card,
    allow_installments: d.payment_enabled && d.allow_installments,
    max_installments: d.payment_enabled && d.allow_installments ? Number(d.max_installments) : 1,
    limit_per_person: d.limit_per_person, max_per_person: d.limit_per_person ? Number(d.max_per_person) : null,
    require_image_consent: d.require_image_consent,
  };

  let eventId = d.id;
  if (eventId) {
    const { error } = await supabase.from("events").update(base).eq("id", eventId);
    if (error) throw error;
  } else {
    const baseSlug = slugify(d.title) || "evento";
    let created: { id: string } | null = null;
    for (const slug of [baseSlug, `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`]) {
      const { data, error } = await supabase.from("events").insert({ ...base, slug, created_by: userId ?? null }).select("id").single();
      if (!error) { created = data; break; }
      if (!error.message.includes("events_slug_key")) throw error;
    }
    if (!created) throw new Error("events_slug_key");
    eventId = created.id;
  }

  // Lotes: atualiza, cria e remove (lote com inscrições não pode ser removido)
  const { data: existing } = await supabase.from("event_lots").select("id, name").eq("event_id", eventId);
  const keep = new Set(lots.filter((l) => l.id).map((l) => l.id!));
  for (const old of existing ?? []) {
    if (keep.has(old.id)) continue;
    const { error } = await supabase.from("event_lots").delete().eq("id", old.id);
    if (error) throw new Error(error.code === "23503" ? `Não dá para remover o lote “${old.name}” porque já tem inscrições.` : error.message);
  }
  for (const l of lots) {
    const row = {
      name: l.name.trim(), position: l.position, price: l.price, capacity: l.capacity, public_access: d.audience === "members" ? l.public_access : true,
      opens_at: fromLocalInput(l.opens_at), closes_at: fromLocalInput(l.closes_at),
    };
    const { error } = l.id
      ? await supabase.from("event_lots").update(row).eq("id", l.id)
      : await supabase.from("event_lots").insert({ ...row, event_id: eventId! });
    if (error) throw error;
  }

  // Dados de pagamento (privados: só quem se inscreveu e a equipe enxergam)
  let qrPath = d.pix_qr_path || null;
  if (qrFile) {
    const blob = await compressImage(qrFile, { maxSide: 900, type: "image/png" }); // QR precisa ficar nítido
    const path = `${eventId}/qr-${Date.now()}.${fileExt(blob, qrFile.name)}`;
    const { error } = await supabase.storage.from("event-assets").upload(path, blob, { contentType: blob.type || qrFile.type });
    if (error) throw new Error("Não foi possível enviar a imagem do QR code.");
    if (qrPath) await supabase.storage.from("event-assets").remove([qrPath]);
    qrPath = path;
  }
  const { error: infoErr } = await supabase.from("event_payment_info").upsert({
    event_id: eventId!, payment_link: d.payment_enabled ? d.payment_link.trim() || null : null,
    pix_key: d.payment_enabled ? d.pix_key.trim() || null : null, pix_qr_path: d.payment_enabled ? qrPath : null,
    card_contact_note: d.payment_enabled && d.accepts_card ? d.card_contact_note.trim() || null : null,
  });
  if (infoErr) throw infoErr;
  return eventId!;
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string | undefined }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);
const Toggle = ({ checked, onChange, title, help }: { checked: boolean; onChange: (v: boolean) => void; title: string; help?: string }) => (
  <label className="flex items-start justify-between gap-4 rounded-xl border px-4 py-3">
    <span>
      <span className="block text-sm font-medium text-foreground">{title}</span>
      {help && <span className="block text-xs text-muted-foreground">{help}</span>}
    </span>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);

export function EventForm({ initial, onSaved }: { initial: EventDraft; onSaved: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: access } = useAccess();
  const [d, setD] = useState<EventDraft>(initial);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [sameCap, setSameCap] = useState("");
  const set = (p: Partial<EventDraft>) => setD((x) => ({ ...x, ...p }));
  const setLot = (i: number, p: Partial<LotDraft>) => setD((x) => ({ ...x, lots: x.lots.map((l, j) => (j === i ? { ...l, ...p } : l)) }));

  const save = useMutation({
    mutationFn: async () => {
      const problem = validate(d);
      if (problem) throw new Error(problem);
      return saveEvent(d, access?.uid, qrFile);
    },
    onSuccess: (id) => {
      toast.success("Evento salvo");
      qc.invalidateQueries({ queryKey: ["admin-events"] });
      qc.invalidateQueries({ queryKey: ["admin-event"] });
      qc.invalidateQueries({ queryKey: ["public-events"] });
      qc.invalidateQueries({ queryKey: ["public-event"] });
      onSaved(id);
    },
    onError: (e) => toast.error(eventError(e)),
  });

  const lots = d.useLots ? d.lots : d.lots.slice(0, 1);

  return (
    <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <section className="space-y-4">
        <h3 className="text-lg text-foreground">Informações</h3>
        <Field label="Nome do evento *"><Input required value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Descrição" hint="Aceita **negrito**, listas e links. Uma linha em branco separa parágrafos."><Textarea rows={5} value={d.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Local"><Input value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="Ex.: Sede da igreja" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data e hora de início *"><Input type="datetime-local" required value={d.starts_at} onChange={(e) => set({ starts_at: e.target.value })} /></Field>
          <Field label="Término (opcional)"><Input type="datetime-local" value={d.ends_at} onChange={(e) => set({ ends_at: e.target.value })} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inscrições abrem em"><Input type="datetime-local" value={d.registration_opens_at} onChange={(e) => set({ registration_opens_at: e.target.value })} /></Field>
          <Field label="Inscrições encerram em"><Input type="datetime-local" value={d.registration_closes_at} onChange={(e) => set({ registration_closes_at: e.target.value })} /></Field>
        </div>
        <Toggle checked={d.published} onChange={(v) => set({ published: v })} title="Publicar evento" help="Quando publicado, aparece na página inicial e em Eventos do site." />
      </section>

      <section className="space-y-4">
        <h3 className="text-lg text-foreground">Quem pode se inscrever</h3>
        <Field label="Público do evento">
          <Select value={d.audience} onValueChange={(v) => set({ audience: v as "public" | "members" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Aberto ao público (membros e visitantes)</SelectItem>
              <SelectItem value="members">Apenas membros (com lotes abertos ao público, se quiser)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Toggle checked={d.limit_per_person} onChange={(v) => set({ limit_per_person: v })} title="Limitar inscrições por pessoa" help="O limite é controlado pelo CPF (validado pelos dígitos verificadores)." />
        {d.limit_per_person && (
          <Field label="Quantas inscrições cada pessoa pode fazer?"><Input type="number" min={1} value={d.max_per_person} onChange={(e) => set({ max_per_person: e.target.value })} className="max-w-32" /></Field>
        )}
        <Toggle checked={d.require_image_consent} onChange={(v) => set({ require_image_consent: v })} title="Exigir autorização de uso de imagem" help="Quem se inscrever precisa marcar “Estou de acordo com meu uso de imagem”. Sem o aceite, a inscrição não é feita." />
      </section>

      <section className="space-y-4">
        <h3 className="text-lg text-foreground">Ingressos, lotes e vagas</h3>
        <Toggle checked={d.useLots} onChange={(v) => set({ useLots: v, lots: v && d.lots.length < 2 ? [...d.lots, blankLot()] : d.lots })} title="Usar lotes" help="Com lotes você define preço, vagas e período para cada um. Sem lotes, há um ingresso único." />
        {lots.map((l, i) => (
          <div key={l.id ?? i} className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">{d.useLots ? `Lote ${i + 1}` : "Ingresso único"}</p>
              {d.useLots && lots.length > 1 && (
                <Button type="button" size="icon" variant="ghost" aria-label="Remover lote" onClick={() => set({ lots: d.lots.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {d.useLots && <Field label="Nome do lote *"><Input value={l.name} onChange={(e) => setLot(i, { name: e.target.value })} placeholder={`Lote ${i + 1}`} /></Field>}
              <Field label="Preço (R$)"><Input inputMode="decimal" value={l.price} onChange={(e) => setLot(i, { price: e.target.value })} /></Field>
              <Field label="Vagas" hint="Vazio = ilimitadas"><Input type="number" min={0} value={l.capacity} onChange={(e) => setLot(i, { capacity: e.target.value })} /></Field>
            </div>
            {d.useLots && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lote abre em (opcional)"><Input type="datetime-local" value={l.opens_at} onChange={(e) => setLot(i, { opens_at: e.target.value })} /></Field>
                <Field label="Lote fecha em (opcional)"><Input type="datetime-local" value={l.closes_at} onChange={(e) => setLot(i, { closes_at: e.target.value })} /></Field>
              </div>
            )}
            {d.audience === "members" && (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox checked={l.public_access} onCheckedChange={(on) => setLot(i, { public_access: !!on })} />
                Aberto ao público (visitantes podem comprar este lote)
              </label>
            )}
          </div>
        ))}
        {d.useLots && (
          <div className="flex flex-wrap items-end gap-3">
            <Button type="button" variant="outline" onClick={() => set({ lots: [...d.lots, blankLot()] })}><Plus className="h-4 w-4" /> Adicionar lote</Button>
            <div className="flex items-end gap-2">
              <Field label="Mesma quantidade de vagas em todos os lotes"><Input type="number" min={0} value={sameCap} onChange={(e) => setSameCap(e.target.value)} className="w-40" /></Field>
              <Button type="button" variant="secondary" disabled={sameCap === ""} onClick={() => set({ lots: d.lots.map((l) => ({ ...l, capacity: sameCap })) })}>Aplicar</Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg text-foreground">Pagamento</h3>
        <Toggle checked={d.payment_enabled} onChange={(v) => set({ payment_enabled: v })} title="Evento com pagamento" help="Quem se inscreve vê como pagar, envia o comprovante ou avisa que pagou; a equipe confere." />
        {d.payment_enabled && (
          <div className="space-y-4 rounded-xl border p-4">
            <Field label="Link de pagamento"><Input type="url" placeholder="https://..." value={d.payment_link} onChange={(e) => set({ payment_link: e.target.value })} /></Field>
            <Field label="Chave Pix"><Input value={d.pix_key} onChange={(e) => set({ pix_key: e.target.value })} /></Field>
            <Field label="Foto do QR code do Pix" hint={d.pix_qr_path && !qrFile ? "Já existe uma imagem enviada. Envie outra para substituir." : undefined}>
              <Input type="file" accept="image/*" onChange={(e) => setQrFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Toggle checked={d.accepts_card} onChange={(v) => set({ accepts_card: v })} title="Aceita cartão" help="O cartão é combinado direto com a igreja: a pessoa vê a mensagem abaixo." />
            {d.accepts_card && <Field label="Mensagem para quem quer pagar no cartão"><Input value={d.card_contact_note} onChange={(e) => set({ card_contact_note: e.target.value })} /></Field>}
            <Toggle checked={d.allow_installments} onChange={(v) => set({ allow_installments: v })} title="Permitir parcelamento no Pix" help="A equipe confirma cada parcela; o ingresso sai quando todas estiverem pagas (ou quando você liberar)." />
            {d.allow_installments && <Field label="Máximo de parcelas"><Input type="number" min={2} max={12} value={d.max_installments} onChange={(e) => set({ max_installments: e.target.value })} className="max-w-32" /></Field>}
          </div>
        )}
      </section>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={save.isPending}>{d.id ? "Salvar alterações" : "Criar evento"}</Button>
    </form>
  );
}
