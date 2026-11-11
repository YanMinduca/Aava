/** Lixeira geral: nomes em português das tabelas, prazo e mensagens de erro. */

export const TRASH_DAYS = 30;

export const TABLE_LABELS: Record<string, string> = {
  members: "Membro / visitante",
  member_notes: "Observação interna de membro",
  member_invites: "Convite",
  member_activity: "Registro de atividade de membro",
  activity_log: "Registro de atividades",
  financial_transactions: "Lançamento financeiro",
  financial_goals: "Meta financeira",
  recurring_bills: "Conta recorrente",
  prayer_requests: "Pedido de oração",
  departments: "Departamento",
  department_members: "Voluntário em departamento",
  department_leaders: "Líder de departamento",
  church_roles: "Cargo",
  church_role_departments: "Cargo × departamento",
  events: "Evento",
  event_lots: "Lote de ingressos",
  event_registrations: "Inscrição em evento",
  event_payments: "Parcela de pagamento",
  event_payment_info: "Dados de pagamento do evento",
  event_tickets: "Ingresso",
  event_ticket_removals: "Remoção de ingresso",
  push_notifications: "Aviso enviado",
  site_content: "Conteúdo do site",
  user_permissions: "Permissão de usuário",
  user_roles: "Cargo de acesso",
};

export const tableLabel = (t: string) => TABLE_LABELS[t] ?? t.replace(/_/g, " ");

/** Dias que faltam para o item ser apagado de vez (mínimo 0). */
export function daysLeft(expiresAt: string, now = new Date()) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / 86400000));
}

const ERRORS: Record<string, string> = {
  trash_conflict:
    "Não deu para restaurar: já existe outro registro igual (por exemplo, o mesmo CPF foi cadastrado de novo). Resolva o duplicado e tente de novo.",
  trash_missing_parent:
    "Não deu para restaurar: falta algo de que este item depende (por exemplo, a conta ou o cadastro já foi apagado de vez).",
  trash_restore_failed: "Não foi possível restaurar este item. Ele continua na lixeira.",
  not_found: "Este item já não está na lixeira.",
  "Acesso negado": "Só o CEO e o Pastor Presidente acessam a lixeira.",
};

export function trashError(e: unknown) {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  for (const [k, v] of Object.entries(ERRORS)) if (msg.includes(k)) return v;
  return "Não foi possível concluir agora. Tente de novo.";
}
