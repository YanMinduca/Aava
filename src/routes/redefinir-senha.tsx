import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Criar nova senha — Comunidade Aava" },
      { name: "description", content: "Crie uma nova senha para acessar a Comunidade Aava." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const MIN_LENGTH = 6;

type Phase = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // O link do e-mail traz a sessão de recuperação na própria URL; o Supabase a lê sozinho.
  // Se nenhuma sessão aparecer (link vencido, já usado ou aberto sem o e-mail), mostramos como pedir outro.
  useEffect(() => {
    let alive = true;
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    if (/error(_code|_description)?=/i.test(hash)) {
      setPhase("invalid");
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" || session) setPhase("ready");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setPhase("ready");
    });
    const timeout = setTimeout(() => {
      if (alive) setPhase((p) => (p === "checking" ? "invalid" : p));
    }, 4000);
    return () => {
      alive = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (password.length < MIN_LENGTH) {
      setProblem(`A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setProblem("As duas senhas não são iguais. Digite de novo.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Por segurança, encerra o login em outros aparelhos (quem tinha a senha antiga).
      try {
        await supabase.auth.signOut({ scope: "others" });
      } catch {
        // não impede a troca de senha
      }
      toast.success("Senha alterada com sucesso!");
      navigate({ to: "/painel" });
    } catch (err) {
      setProblem(friendlyAuthError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-soft px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-8 shadow-soft">
        <Link to="/" className="font-display text-xl text-foreground">
          Comunidade <span className="text-primary">Aava</span>
        </Link>
        <h1 className="mt-6 text-2xl text-foreground">Criar nova senha</h1>

        {phase === "checking" && (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            Verificando seu link…
          </p>
        )}

        {phase === "invalid" && (
          <div className="mt-6 space-y-4" role="alert">
            <p className="text-sm text-foreground">
              Este link expirou, já foi usado ou não está completo. Isso é normal: por segurança
              cada link vale por pouco tempo.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Pedir um novo link</Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Na tela de entrada, toque em “Esqueci minha senha”.
            </p>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Nova senha</Label>
              <div className="relative">
                <Input
                  id="new-pw"
                  type={show ? "text" : "password"}
                  required
                  minLength={MIN_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Esconder senha" : "Mostrar senha"}
                  aria-pressed={show}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Mínimo de {MIN_LENGTH} caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Repita a nova senha</Label>
              <Input
                id="confirm-pw"
                type={show ? "text" : "password"}
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
