import { supabase } from "@/integrations/supabase/client";

/** Versão do texto da Política de Privacidade. Mude quando o texto mudar de forma relevante. */
export const PRIVACY_VERSION = "2026-11-07";
export const PRIVACY_UPDATED_LABEL = "7 de novembro de 2026";

/** Dados guardados no cadastro da conta como prova do consentimento (LGPD, art. 8º, §2º). */
export function privacyConsentMetadata(now: Date = new Date()) {
  return { privacy_accepted_at: now.toISOString(), privacy_version: PRIVACY_VERSION };
}

/** Consentimento específico e destacado para dado sensível (religião), exigido pela LGPD, art. 11, I. */
export async function recordSensitiveConsent(): Promise<void> {
  try {
    await supabase.auth.updateUser({
      data: {
        sensitive_consent_at: new Date().toISOString(),
        sensitive_consent_version: PRIVACY_VERSION,
      },
    });
  } catch {
    // sem efeito: o aceite já foi exigido na tela
  }
}

/**
 * Anota o consentimento na conta que já está logada (ex.: ao completar os dados de visitante em um evento).
 * Nunca lança erro: falhar em anotar não pode impedir a inscrição da pessoa.
 */
export async function recordPrivacyConsent(): Promise<void> {
  try {
    await supabase.auth.updateUser({ data: privacyConsentMetadata() });
  } catch {
    // sem efeito: o aceite já foi exigido na tela
  }
}
