/**
 * Traduz as mensagens de erro de autenticação do Supabase (em inglês) para português simples.
 * Usado nos fluxos de recuperação de senha. Mensagens desconhecidas viram um texto genérico,
 * para a pessoa nunca ver um erro técnico em inglês.
 */
const RULES: { test: RegExp; message: string }[] = [
  {
    test: /only request this after|rate limit|too many requests|over_email_send_rate_limit/i,
    message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
  },
  {
    test: /same password|different from the old password/i,
    message: "A nova senha precisa ser diferente da senha atual.",
  },
  {
    test: /password should be at least|weak password|password is too short/i,
    message:
      "A senha é muito curta ou fraca. Use pelo menos 6 caracteres, de preferência misturando letras e números.",
  },
  {
    test: /invalid email|unable to validate email|email address .* is invalid/i,
    message: "Esse e-mail não parece válido. Confira se digitou corretamente.",
  },
  {
    test: /auth session missing|session.*(expired|not found)|jwt expired|invalid jwt|token.*(expired|invalid)|otp_expired|link.*expired/i,
    message: "Este link expirou ou já foi usado. Peça um novo link de redefinição.",
  },
  {
    test: /failed to fetch|network|fetch failed/i,
    message: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
  },
];

export function friendlyAuthError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.message;
  }
  return "Não foi possível concluir. Tente novamente em instantes.";
}
