/**
 * Apoio ao vínculo "Sou eu" do primeiro acesso: a pessoa digita CPF, telefone, e-mail ou RG em "Meu cadastro" e,
 * se bater com um cadastro que a igreja já tem (sem conta), aparece o pop-up para vincular.
 * As regras valem no banco (find_member_matches / claim_member_match); aqui só se evita chamar o banco com
 * valores incompletos e se prepara o texto do pop-up.
 */

export type MatchInput = {
  cpf?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  rg?: string | null | undefined;
};

export type MemberMatch = {
  member_id: string;
  member_name: string;
  cpf_last2: string | null;
  member_email: string | null;
  member_photo: string | null;
  matched_by: string[];
  needs_cpf: boolean;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** CPF completo (11 dígitos) ou nulo. */
export function normCpf(s: string | null | undefined): string | null {
  const d = digits(s);
  return d.length === 11 ? d : null;
}

/** Telefone com DDD (10 ou 11 dígitos, sem o 55 do país) ou nulo. */
export function normPhone(s: string | null | undefined): string | null {
  let d = digits(s);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** E-mail com cara de e-mail completo, em minúsculas, ou nulo. */
export function normEmail(s: string | null | undefined): string | null {
  const e = (s ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

/** RG com pelo menos 5 letras/números, ou nulo. */
export function normRg(s: string | null | undefined): string | null {
  const r = (s ?? "").toLowerCase().replace(/[^0-9a-z]/g, "");
  return r.length >= 5 ? r : null;
}

/** Só o que está completo; nulo quando nada está pronto para ser procurado. */
export function matchKeys(i: MatchInput) {
  const keys = {
    cpf: normCpf(i.cpf),
    phone: normPhone(i.phone),
    email: normEmail(i.email),
    rg: normRg(i.rg),
  };
  return keys.cpf || keys.phone || keys.email || keys.rg ? keys : null;
}

/** CPF escondido, com só os dois últimos dígitos à mostra. */
export function maskedCpf(last2: string | null | undefined): string {
  return last2 && /^\d{2}$/.test(last2) ? `•••.•••.•••-${last2}` : "CPF não informado";
}

const BY_LABEL: Record<string, string> = {
  cpf: "CPF",
  telefone: "telefone",
  email: "e-mail",
  rg: "RG",
};

/** "CPF", "CPF e telefone", "CPF, telefone e e-mail"... */
export function matchedByText(by: readonly string[]): string {
  const names = by.map((b) => BY_LABEL[b]).filter((x): x is string => !!x);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export const MATCH_CLAIM_MESSAGES: Record<string, string> = {
  no_match: "Os dados digitados não conferem com este cadastro. Confira e tente de novo.",
  cpf_required: "Para sua segurança, digite o CPF deste cadastro para confirmar.",
  wrong_cpf: "O CPF não confere. Confira os números e tente de novo.",
  no_cpf:
    "Este cadastro não tem CPF registrado, então não dá para confirmar por aqui. Procure a secretaria da igreja para vincular.",
  locked: "Muitas tentativas. Procure a secretaria da igreja para vincular seu cadastro.",
  unavailable: "Este cadastro não está mais disponível para vincular.",
  already_linked: "Sua conta já está vinculada a um cadastro.",
};
