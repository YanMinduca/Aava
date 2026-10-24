import type { Json } from "@/integrations/supabase/types";

export const moneyBR = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
export const fmtLongDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Valor para <input type="datetime-local"> (horário local) a partir de um ISO. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const cpfDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
export function formatCpf(v: string) {
  const d = cpfDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
/** Valida os dígitos verificadores do CPF (não consulta a Receita Federal). */
export function isValidCpf(v: string) {
  const d = cpfDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * (len + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const ERRORS: Record<string, string> = {
  login_required: "Entre na sua conta para continuar.",
  event_not_found: "Evento não encontrado.",
  registration_closed: "As inscrições deste evento não estão abertas.",
  image_consent_required: "Para se inscrever, marque “Estou de acordo com meu uso de imagem”.",
  lot_not_found: "Lote não encontrado.",
  lot_closed: "Este lote não está disponível no momento.",
  profile_required: "Complete seus dados para se inscrever.",
  members_only: "Este lote é exclusivo para membros.",
  invalid_quantity: "Quantidade de ingressos inválida.",
  invalid_cpf: "CPF inválido. Confira os números.",
  limit_exceeded: "Você já atingiu o limite de inscrições por pessoa neste evento.",
  sold_out: "As vagas deste lote acabaram (ou não há vagas suficientes para essa quantidade).",
  invalid_installments: "Número de parcelas não permitido.",
  cpf_in_use: "Este CPF já está cadastrado em outra conta.",
  cpf_belongs_to_member: "Este CPF já consta no cadastro de um membro. Escolha “Sou membro” e entre com a conta de membro.",
  invalid_name: "Digite seu nome completo.",
  invalid_phone: "Informe um telefone para contato.",
  cannot_cancel: "Esta inscrição não pode mais ser cancelada por aqui. Fale com a igreja.",
  payment_closed: "Este pagamento não pode mais ser alterado.",
  invalid_proof: "Arquivo de comprovante inválido.",
  registration_already_confirmed: "A inscrição já foi confirmada; não dá para desfazer este pagamento.",
  registration_cancelled: "Esta inscrição foi cancelada.",
  not_pending: "Esta inscrição não está aguardando pagamento.",
  "Acesso negado": "Você não tem permissão para isso.",
};
export function eventError(e: unknown) {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  if (msg.includes("events_slug_key")) return "Já existe um evento com esse endereço (slug). Mude o nome ou o endereço.";
  return ERRORS[msg] ?? (msg || "Algo deu errado. Tente novamente.");
}

export const REGISTRATION_STATUS: Record<string, string> = {
  pending: "Aguardando pagamento",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
};
export const PAYMENT_STATUS: Record<string, string> = {
  pending: "Pendente",
  claimed: "Aguardando verificação",
  paid: "Pago",
};
export const TICKET_STATUS: Record<string, string> = {
  valid: "Válido",
  checked_in: "Presente",
  cancelled: "Cancelado",
};

export type PublicLot = {
  id: string;
  name: string;
  price: number;
  capacity: number | null;
  spots_left: number | null;
  public_access: boolean;
  opens_at: string | null;
  closes_at: string | null;
};
export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  audience: "public" | "members";
  payment_enabled: boolean;
  accepts_card: boolean;
  allow_installments: boolean;
  max_installments: number;
  limit_per_person: boolean;
  max_per_person: number | null;
  require_image_consent: boolean;
};
export type PublicEventDetail = { event: PublicEvent; lots: PublicLot[] };
export const asEventDetail = (j: Json | null) => (j ? (j as unknown as PublicEventDetail) : null);

export const lotIsOpen = (l: PublicLot, now = new Date()) =>
  (!l.opens_at || new Date(l.opens_at) <= now) && (!l.closes_at || new Date(l.closes_at) >= now);
export const registrationIsOpen = (e: Pick<PublicEvent, "registration_opens_at" | "registration_closes_at">, now = new Date()) =>
  (!e.registration_opens_at || new Date(e.registration_opens_at) <= now) && (!e.registration_closes_at || new Date(e.registration_closes_at) >= now);
