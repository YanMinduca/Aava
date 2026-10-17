import { useEffect, useState } from "react";
import { toast } from "sonner";
import { UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Candidate = { id: string; full_name: string; has_cpf: boolean };

const MESSAGES: Record<string, string> = {
  wrong_cpf: "O CPF não confere. Confira os números e tente de novo.",
  locked: "Muitas tentativas. Procure a secretaria da igreja para vincular seu cadastro.",
  no_cpf: "Este cadastro não tem CPF registrado. Procure a secretaria da igreja para vincular.",
  unavailable: "Este cadastro não está mais disponível para vincular.",
  already_linked: "Sua conta já está vinculada a um cadastro.",
};

/**
 * Mostra "Este é você?" quando o nome digitado bate com um cadastro feito pela igreja que ainda não tem conta.
 * Se a pessoa confirmar o CPF, a conta é vinculada ao cadastro existente (sem criar um novo).
 */
export function ClaimSuggestion({ name, onClaimed }: { name: string; onClaimed: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [cpf, setCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setConfirming(null);
    setNotice("");
    if (name.trim().split(/\s+/).length < 2) {
      setCandidates([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("find_claimable_members", { _name: name });
      setCandidates(data ?? []);
    }, 900);
    return () => clearTimeout(t);
  }, [name]);

  const candidate = candidates.find((c) => !dismissed.includes(c.id));
  if (!candidate) return null;

  async function confirm() {
    if (!candidate) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_member", { _member: candidate.id, _cpf: cpf });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data === "ok") {
      toast.success("Pronto! Sua conta foi vinculada ao seu cadastro.");
      onClaimed();
      return;
    }
    setNotice(MESSAGES[data ?? ""] ?? "Não foi possível vincular agora.");
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft p-4 text-sm">
      <p className="flex items-start gap-2 text-foreground">
        <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          A igreja já tem um cadastro com este nome: <strong>{candidate.full_name}</strong>. <strong>Este é você?</strong>
        </span>
      </p>
      {confirming !== candidate.id ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (!candidate.has_cpf) return setNotice(MESSAGES["no_cpf"] ?? "");
              setConfirming(candidate.id);
              setNotice("");
            }}
          >
            Sim, sou eu
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { setDismissed([...dismissed, candidate.id]); setNotice(""); }}>
            Não
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-muted-foreground">Para confirmar, digite o seu CPF:</p>
          <div className="flex flex-wrap gap-2">
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              className="max-w-52 bg-background"
            />
            <Button type="button" size="sm" disabled={busy || cpf.replace(/\D/g, "").length !== 11} onClick={confirm}>Confirmar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setConfirming(null); setCpf(""); setNotice(""); }}>Cancelar</Button>
          </div>
        </div>
      )}
      {notice && <p className="mt-3 text-destructive">{notice}</p>}
    </div>
  );
}
