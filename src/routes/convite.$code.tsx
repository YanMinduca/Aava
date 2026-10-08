import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/convite/$code")({
  head: () => ({
    meta: [
      { title: "Convite — Comunidade Aava" },
      { name: "description", content: "Você foi convidado para fazer parte da Comunidade Aava." },
      { property: "og:title", content: "Convite — Comunidade Aava" },
      { property: "og:description", content: "Complete seu cadastro de membro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"up" | "in">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const next = `/painel/meu-cadastro?convite=${encodeURIComponent(code)}`;

  useEffect(() => {
    supabase.rpc("check_invite", { _code: code }).then(({ data }) => setValid(!!data));
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/painel/meu-cadastro", search: { convite: code } });
    });
  }, [code, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + next, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/painel/meu-cadastro", search: { convite: code } });
        else setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/painel/meu-cadastro", search: { convite: code } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-soft px-4">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-8 shadow-soft">
        <Link to="/" className="font-display text-xl text-foreground">Comunidade <span className="text-primary">Aava</span></Link>
        {valid === false ? (
          <>
            <h1 className="mt-6 text-2xl text-foreground">Convite inválido</h1>
            <p className="mt-2 text-sm text-muted-foreground">Este link expirou ou já foi usado. Peça um novo convite ao responsável da igreja.</p>
          </>
        ) : sent ? (
          <>
            <h1 className="mt-6 text-2xl text-foreground">Confira seu e-mail</h1>
            <p className="mt-2 text-sm text-muted-foreground">Enviamos um link de confirmação para {email}. Depois de confirmar, você poderá preencher seu cadastro.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-2xl text-foreground">Você foi convidado!</h1>
            <p className="mt-2 text-sm text-muted-foreground">{mode === "up" ? "Crie sua conta para completar seu cadastro de membro." : "Entre para completar seu cadastro."}</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "up" && (
                <div className="space-y-1.5"><Label>Nome completo</Label><Input required value={name} onChange={(e) => setName(e.target.value)} /></div>
              )}
              <div className="space-y-1.5"><Label>E-mail</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Senha</Label><Input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={loading || valid === null}>{loading ? "Aguarde..." : mode === "up" ? "Criar conta" : "Entrar"}</Button>
            </form>
            <button className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "up" ? "in" : "up")}>
              {mode === "up" ? "Já tem conta? Entrar" : "Não tem conta? Criar conta"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
