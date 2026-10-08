export const CHURCH = {
  name: "Comunidade Aava",
  address: "Av. Maria Augusta Fagundes Gomes, 447 - Res. Santa Maria",
  city: "Jacareí - SP",
  mapsQuery: "Av. Maria Augusta Fagundes Gomes, 447, Jacareí - SP",
};

export const PERMISSION_GROUPS: { label: string; perms: { key: string; label: string }[] }[] = [
  {
    label: "Membros",
    perms: [
      { key: "view_members", label: "Ver membros" },
      { key: "create_member", label: "Cadastrar membros" },
      { key: "edit_member", label: "Editar membros" },
      { key: "delete_member", label: "Excluir membros" },
      { key: "approve_member", label: "Aprovar cadastros" },
      { key: "invite_member", label: "Gerar convites" },
      { key: "view_member_notes", label: "Ver/editar observações internas" },
    ],
  },
  {
    label: "Financeiro",
    perms: [
      { key: "view_finance", label: "Ver financeiro" },
      { key: "create_financial_transaction", label: "Lançar receitas/despesas" },
      { key: "edit_financial_transaction", label: "Editar lançamentos e contas recorrentes" },
      { key: "delete_financial_transaction", label: "Excluir lançamentos" },
      { key: "create_financial_goal", label: "Criar metas" },
      { key: "edit_financial_goal", label: "Editar metas" },
      { key: "view_financial_reports", label: "Ver relatórios e indicadores" },
      { key: "export_financial_reports", label: "Exportar relatórios (PDF/CSV)" },
    ],
  },
  {
    label: "Oração",
    perms: [{ key: "view_prayer_requests", label: "Ver pedidos de oração" }],
  },
  {
    label: "Configurações",
    perms: [{ key: "manage_permissions", label: "Ver usuários e permissões" }],
  },
];

export const ROLE_LABELS: Record<string, string> = {
  ceo: "CEO / Super Admin",
  pastor_presidente: "Pastor Presidente",
  admin: "Administrador",
  leader: "Líder",
  volunteer: "Voluntário",
  member: "Membro",
};

export const MEMBER_STATUS: Record<string, string> = {
  visitante: "Visitante",
  membro: "Membro",
  membro_ativo: "Membro ativo",
  afastado: "Afastado",
  inativo: "Inativo",
  outro: "Outro",
};

export const APPROVAL_LABELS: Record<string, string> = {
  pendente: "Pendente de aprovação",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

export const MARITAL = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União estável"];

export const INCOME_CATEGORIES = ["Dízimos", "Ofertas", "Doações", "Eventos", "Outras receitas"];
export const EXPENSE_CATEGORIES = [
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Salários/Ajudas",
  "Manutenção",
  "Equipamentos",
  "Eventos",
  "Missões",
  "Outros gastos",
];
export const PAYMENT_METHODS = [
  "Pix",
  "Dinheiro",
  "Cartão de débito",
  "Cartão de crédito",
  "Transferência",
  "Boleto",
  "Outro",
];

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dateBR = (d?: string | null) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "—";
export const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function ageFrom(birth?: string | null) {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00");
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate()))
    a--;
  return a >= 0 ? a : null;
}

export function formatCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}
