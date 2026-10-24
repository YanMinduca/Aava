import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CLAIM_MESSAGES } from "@/components/members/ClaimSuggestion";
import { useDebounced } from "@/lib/use-debounced";

/**
 * Para quem está criando o próprio cadastro: se o CPF digitado já existe no banco, não deixa criar um novo
 * cadastro; só oferece vincular a conta ao cadastro que já existe. (O banco também barra o CPF repetido.)
 */
export function CpfSignupNotice({
  cpf,
  canClaim,
  onBlockChange,
  onClaimed,
}: {
  cpf: string;
  /** Falso quando a conta já tem cadastro próprio (aí não há o que vincular). */
  canClaim: boolean;
  onBlockChange: (blocked: boolean) => void;
  onClaimed: () => void;
}) {
  const digits = cpf.replace(/\D/g, "");
  const settled = useDebounced(digits, 500);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const q = useQuery({
    queryKey: ["cpf-signup", settled],
    enabled: settled.length === 11,
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("check_cpf_for_signup", { _cpf: settled });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const hit = settled.length === 11 && digits === settled ? (q.data ?? null) : null;
  const blocked = !!hit && hit.state !== "limited";
  useEffect(() => onBlockChange(blocked), [blocked, onBlockChange]);
  useEffect(() => setNotice(""), [settled]);

  if (!hit) return null;

  async function claim() {
    if (!hit?.id) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_member", { _member: hit.id, _cpf: cpf });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data === "ok") {
      toast.success("Pronto! Sua conta foi vinculada ao cadastro que já existia.");
      onClaimed();
      return;
    }
    setNotice(CLAIM_MESSAGES[data ?? ""] ?? "Não foi possível vincular agora.");
  }

  if (hit.state === "limited") {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Muitas consultas seguidas. Se este CPF já tiver cadastro na igreja, o sistema vai avisar ao enviar.
      </p>
    );
  }

  const claimable = hit.state === "claimable" && canClaim;
  return (
    <div role="alert" className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="flex items-start gap-2 font-medium text-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
        <span>
          {claimable
            ? <>Já existe um cadastro com este CPF{hit.masked_name ? <> (<strong>{hit.masked_name}</strong>)</> : null}. Para não duplicar, não é possível criar outro cadastro com ele.</>
            : hit.state === "in_use"
              ? "Este CPF já está vinculado a outra conta. Se é o seu, procure a secretaria da igreja."
              : "Este CPF já consta em outro cadastro. Procure a secretaria da igreja para resolver."}
        </span>
      </p>
      {claimable && (
        <div className="mt-3">
          <Button type="button" size="sm" disabled={busy} onClick={claim}>
            Este cadastro é meu — vincular minha conta
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Seus dados ficam como a igreja já tem; depois você pode atualizá-los em “Meu cadastro”.</p>
        </div>
      )}
      {notice && <p className="mt-3 text-destructive">{notice}</p>}
    </div>
  );
}
