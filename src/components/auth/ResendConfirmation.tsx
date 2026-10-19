import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RESEND_MAX, recordSend, resendStatus, type ResendStore } from "@/lib/resend-limit";

const friendly = (message: string) =>
  /rate|seconds|too many|limit/i.test(message) ? "Aguarde um pouco antes de pedir um novo e-mail." : message;

/** "Não recebeu o e-mail?" com botão de reenviar (máximo 3 vezes, 1 minuto entre os envios). */
export function ResendConfirmation({ email, redirectTo, store }: { email: string; redirectTo: string; store?: ResendStore }) {
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const status = resendStatus(email, now, store);
  const seconds = Math.ceil(status.waitMs / 1000);

  async function resend() {
    setSending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
    setSending(false);
    if (error) {
      toast.error(friendly(error.message));
      return;
    }
    recordSend(email, { resend: true }, Date.now(), store);
    setNow(Date.now());
    toast.success("E-mail reenviado! Confira também a caixa de spam.");
  }

  return (
    <div className="mt-6 rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm" role="status">
      <p className="flex items-start gap-2 text-foreground">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          Enviamos um e-mail de confirmação para <strong>{email}</strong>. Clique no link para ativar a conta. Não chegou? Veja o spam ou reenvie.
        </span>
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled={!status.canResend || sending} onClick={resend}>
        {status.reason === "wait" ? `Reenviar e-mail de confirmação (aguarde ${seconds}s)` : "Reenviar e-mail de confirmação"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        {status.reason === "limit"
          ? `Você já usou os ${RESEND_MAX} reenvios. Tente de novo mais tarde ou fale com a igreja.`
          : `Restam ${status.remaining} ${status.remaining === 1 ? "reenvio" : "reenvios"}, com 1 minuto de intervalo.`}
      </p>
    </div>
  );
}
