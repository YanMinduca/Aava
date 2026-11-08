import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESEND_SECONDS = 60;

type Props = {
  email: string;
  onEmailChange: (email: string) => void;
  onBack: () => void;
};

/** Tela "Recuperar senha": pede o e-mail e envia o link para criar uma nova senha (página /redefinir-senha). */
export function ForgotPasswordCard({ email, onEmailChange, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (cooldown > 0 || loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/redefinir-senha",
      });
      if (error) throw error;
      // Mensagem neutra de propósito: não revela se o e-mail tem conta ou não.
      setSentTo(email.trim());
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-soft px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-8 shadow-soft">
        <Link to="/" className="font-display text-xl text-foreground">
          Comunidade <span className="text-primary">Aava</span>
        </Link>
        <h1 className="mt-6 text-2xl text-foreground">Recuperar senha</h1>

        {sentTo ? (
          <div className="mt-6 space-y-4" role="status">
            <p className="text-sm text-foreground">
              Se existir uma conta com o e-mail <strong className="break-all">{sentTo}</strong>,
              enviamos um link para criar uma nova senha.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra seu e-mail e clique no link (ele vale por pouco tempo).</li>
              <li>
                Não chegou? Olhe também a caixa de <strong>spam</strong> ou lixo eletrônico.
              </li>
            </ul>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={loading || cooldown > 0}
              onClick={() => void send()}
            >
              {cooldown > 0 ? `Enviar de novo em ${cooldown}s` : "Enviar o link de novo"}
            </Button>
          </div>
        ) : (
          <form onSubmit={send} className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Digite o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">E-mail</Label>
              <Input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
          </form>
        )}

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          Voltar para entrar
        </button>
      </div>
    </div>
  );
}
