import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { recordSend } from "@/lib/resend-limit";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string | undefined; mode?: "up" | undefined } => ({
    next: s['next'] === '/oracao' ? '/oracao' : typeof s['next'] === 'string' && /^\/eventos\/[a-z0-9-]+$/.test(s['next']) ? s['next'] : undefined,
    mode: s['mode'] === 'up' ? 'up' : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Comunidade Aava" },
      { name: "description", content: "Acesso à área restrita da Comunidade Aava." },
      { property: "og:title", content: "Entrar — Comunidade Aava" },
      { property: "og:description", content: "Acesso à área restrita." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next, mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up">(initialMode ?? "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const redirectTo = typeof window === "undefined" ? "" : window.location.origin + (next ?? "/painel");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: next ?? '/painel' });
      } else {
        const { data: signed, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + (next ?? "/painel"), data: { full_name: name } },
        });
        if (error) throw error;
        if (signed.session && next) {
          toast.success("Conta criada!");
          navigate({ to: next });
          return;
        }
        toast.success("Conta criada! Confira seu e-mail para confirmar o cadastro.");
        recordSend(email, { resend: false });
        setPendingEmail(email);
        setMode("in");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao entrar";
      if (/email not confirmed/i.test(message)) {
        setPendingEmail(email);
        toast.error("Confirme seu e-mail antes de entrar. Enviamos um link para a sua caixa de entrada.");
      } else {
        toast.error(message);
      }
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
        <h1 className="mt-6 text-2xl text-foreground">{mode === "in" ? "Entrar" : "Criar conta"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Senha</Label>
            <Input id="pw" type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : mode === "in" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <button className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
        </button>
        {pendingEmail && <ResendConfirmation email={pendingEmail} redirectTo={redirectTo} />}
      </div>
    </div>
  );
}
