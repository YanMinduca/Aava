import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { MEMBER_STATUS } from "@/lib/church";
import { useDebounced } from "@/lib/use-debounced";

/**
 * Aviso para quem cadastra/edita membros: mostra se já existe alguém com o mesmo nome, CPF ou RG.
 * Um CPF repetido é bloqueado pelo banco ao salvar; nome e RG repetidos são só um aviso (pode ser homônimo).
 */
export function MemberDuplicateAlert({
  name,
  cpf,
  rg,
  excludeId,
  className = "",
}: {
  name?: string | null | undefined;
  cpf?: string | null | undefined;
  rg?: string | null | undefined;
  /** Cadastro que está sendo editado (não conta como duplicado de si mesmo). */
  excludeId?: string | null | undefined;
  className?: string;
}) {
  const typed = useDebounced(JSON.stringify([name ?? "", cpf ?? "", rg ?? ""]));
  const [n = "", c = "", r = ""] = JSON.parse(typed) as string[];
  const enabled =
    n.trim().split(/\s+/).filter(Boolean).length >= 2 ||
    c.replace(/\D/g, "").length === 11 ||
    r.replace(/[^0-9a-z]/gi, "").length >= 5;

  const q = useQuery({
    queryKey: ["member-duplicates", n, c, r, excludeId ?? null],
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("find_member_duplicates", {
        _name: n,
        _cpf: c,
        _rg: r,
        ...(excludeId ? { _exclude: excludeId } : {}),
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = enabled ? (q.data ?? []) : [];
  if (rows.length === 0) return null;
  const cpfTaken = rows.some((d) => d.match_cpf);

  return (
    <div
      role="alert"
      className={`rounded-xl border p-4 text-sm ${cpfTaken ? "border-destructive/40 bg-destructive/5" : "border-primary/30 bg-primary-soft"} ${className}`}
    >
      <p className="flex items-start gap-2 font-medium text-foreground">
        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${cpfTaken ? "text-destructive" : "text-primary"}`} aria-hidden />
        {cpfTaken
          ? "Este CPF já está cadastrado. Não é possível salvar outro cadastro com ele."
          : "Já existe cadastro parecido. Confira antes de salvar para não duplicar o membro."}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-2">
            <span className="font-medium text-foreground">{d.full_name}</span>
            <span className="text-xs text-muted-foreground">
              {d.registration_number ? `Matrícula ${d.registration_number} · ` : ""}
              {MEMBER_STATUS[d.status] ?? d.status}
              {d.approval_status !== "aprovado" ? " · aguardando aprovação" : ""}
              {d.has_account ? " · já tem conta" : ""}
            </span>
            <span className="flex flex-wrap gap-1">
              {d.match_cpf && <Badge variant="destructive">mesmo CPF</Badge>}
              {d.match_rg && <Badge variant="secondary">mesmo RG</Badge>}
              {d.match_name && <Badge variant="secondary">mesmo nome</Badge>}
            </span>
            <Link
              to="/painel/membro/$id"
              params={{ id: d.id }}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-xs text-primary underline"
            >
              Abrir cadastro
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
