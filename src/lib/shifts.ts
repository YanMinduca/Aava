/** Escalas dos departamentos: tipos e funções puras (datas, cultos do site, agrupamento). */

export type ShiftStatus = "pending" | "confirmed" | "change_requested";

/** Uma linha de `dept_schedule` (um voluntário em um culto). */
export type ShiftRow = {
  shift_id: string;
  shift_date: string;
  service_name: string;
  service_time: string | null;
  notes: string | null;
  member_id: string | null;
  member_name: string | null;
  has_account: boolean | null;
  status: string | null;
  acknowledged_at: string | null;
  change_reason: string | null;
  change_requested_at: string | null;
  leader_note: string | null;
  is_me: boolean | null;
};

/** Uma linha de `my_shifts` (próxima escala da própria pessoa). */
export type MyShift = {
  shift_id: string;
  department_id: string;
  department_name: string;
  shift_date: string;
  service_name: string;
  service_time: string | null;
  notes: string | null;
  status: string;
  change_reason: string | null;
  leader_note: string | null;
  team: string[];
};

export type ShiftMember = {
  memberId: string;
  name: string;
  hasAccount: boolean;
  status: ShiftStatus;
  acknowledgedAt: string | null;
  changeReason: string | null;
  changeRequestedAt: string | null;
  leaderNote: string | null;
  isMe: boolean;
};

export type Shift = { id: string; date: string; name: string; time: string | null; notes: string | null; members: ShiftMember[] };

export type ShiftWarning = { member_id: string; kind: "double" | "consecutive" | "monthly"; detail: string; total: number | null };

export const STATUS_LABEL: Record<ShiftStatus, string> = {
  pending: "Aguardando ciente",
  confirmed: "Ciente",
  change_requested: "Pediu alteração",
};

/** "2026-11-08" -> Date local (sem deslocar o dia por causa do fuso). */
export function parseISODate(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hoje no horário de Brasília, como "AAAA-MM-DD" (a escala segue o dia da igreja, não o do aparelho). */
export function todayBR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const LONG = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const SHORT = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

export const fmtShiftLong = (iso: string) => LONG.format(parseISODate(iso));
export const fmtShiftShort = (iso: string) => SHORT.format(parseISODate(iso)).replace(".", "");
export const weekdayName = (d: Date) => WEEKDAY.format(d);

/** "18:00:00" -> "18h00"; sem horário (ou 00:00) -> "". */
export function fmtShiftTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h = "00", m = "00"] = t.split(":");
  if (h === "00" && m === "00") return "";
  return `${String(Number(h)).padStart(2, "0")}h${m}`;
}

/** "18h00" / "20h" / "19:30" -> "18:00" (ou null se não der para entender). */
export function parseServiceTime(text: string): string | null {
  const m = /(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i.exec(text);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2] ?? "0");
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const DAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Dia da semana (0 = domingo) de um texto como "Domingo" ou "Quarta-feira"; null se não reconhecer. */
export function weekdayFromText(text: string): number | null {
  const i = DAY_KEYS.indexOf(normalize(text).slice(0, 3));
  return i >= 0 ? i : null;
}

export type ServiceOption = { name: string; time: string | null };

/** Cultos do site (aba Cultos) que acontecem no dia da semana da data escolhida. */
export function servicesForDate(date: Date, schedule: { day: string; time: string; name: string }[]): ServiceOption[] {
  return schedule
    .filter((s) => weekdayFromText(s.day) === date.getDay())
    .map((s) => ({ name: s.name.trim() || "Culto", time: parseServiceTime(s.time) }));
}

/** Junta as linhas (voluntário por linha) em cultos com a lista de voluntários. */
export function groupShifts(rows: ShiftRow[]): Shift[] {
  const map = new Map<string, Shift>();
  for (const r of rows) {
    let s = map.get(r.shift_id);
    if (!s) {
      s = { id: r.shift_id, date: r.shift_date, name: r.service_name, time: r.service_time, notes: r.notes, members: [] };
      map.set(r.shift_id, s);
    }
    if (r.member_id) {
      s.members.push({
        memberId: r.member_id,
        name: r.member_name ?? "",
        hasAccount: r.has_account ?? false,
        status: (r.status as ShiftStatus) ?? "pending",
        acknowledgedAt: r.acknowledged_at,
        changeReason: r.change_reason,
        changeRequestedAt: r.change_requested_at,
        leaderNote: r.leader_note,
        isMe: r.is_me ?? false,
      });
    }
  }
  return [...map.values()];
}

/** Primeiro e último dia (inclusive) do mês de `d`, como "AAAA-MM-DD". */
export function monthBounds(d: Date): { from: string; to: string } {
  return { from: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}

/** Traduz os códigos de erro das funções do banco para frases claras. */
export function shiftError(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const table: Record<string, string> = {
    forbidden: "Você não tem permissão para fazer isso.",
    shift_exists: "Já existe uma escala deste departamento nesse dia e horário.",
    shift_past: "Não dá para criar ou alterar escala de uma data que já passou.",
    no_members: "Escolha pelo menos um voluntário.",
    invalid_member: "Algum voluntário escolhido não faz parte do departamento.",
    invalid_reason: "Explique o motivo com pelo menos 5 letras.",
    shift_not_found: "Essa escala não existe mais ou a data já passou.",
    invalid_shift: "Confira a data e o nome do culto.",
  };
  const code = Object.keys(table).find((k) => m.includes(k));
  return code ? (table[code] as string) : "Não foi possível concluir agora. Tente de novo em instantes.";
}
