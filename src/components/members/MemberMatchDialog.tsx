import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberAvatar } from "@/components/members/MemberForm";
import { formatCpf } from "@/lib/church";
import { useDebounced } from "@/lib/use-debounced";
import {
  MATCH_CLAIM_MESSAGES,
  matchKeys,
  matchedByText,
  maskedCpf,
  normCpf,
  type MemberMatch,
} from "@/lib/member-match";

/**
 * Pop-up "Vincular a esse cadastro" do primeiro acesso.
 *
 * Observa CPF, telefone, e-mail e RG de "Meu cadastro". Quando algum valor completo bate com um cadastro que a
 * igreja já tem (e que ainda não tem conta), mostra foto, nome, CPF só com os 2 últimos dígitos e e-mail, com o
 * botão "Sou eu". O banco decide o que vale: CPF igual (ou o e-mail confirmado da própria conta) vincula direto;
 * telefone, RG ou outro e-mail pedem também o CPF do cadastro.
 */
export function MemberMatchDialog({
  cpf,
  phone,
  email,
  rg,
  enabled,
  onClaimed,
}: {
  cpf: string | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
  rg: string | null | undefined;
  /** Falso quando a conta já tem cadastro (não há o que vincular). */
  enabled: boolean;
  onClaimed: () => void;
}) {
  const sig = JSON.stringify(matchKeys({ cpf, phone, email, rg }));
  const settled = useDebounced(sig, 700);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [confirmCpf, setConfirmCpf] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const q = useQuery({
    queryKey: ["member-matches", settled],
    enabled: enabled && settled !== "null",
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<MemberMatch[]> => {
      const k = JSON.parse(settled) as {
        cpf: string | null;
        phone: string | null;
        email: string | null;
        rg: string | null;
      };
      const { data, error } = await supabase.rpc("find_member_matches", {
        _cpf: k.cpf ?? "",
        _phone: k.phone ?? "",
        _email: k.email ?? "",
        _rg: k.rg ?? "",
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Só vale o resultado se a pessoa não mexeu nos campos depois da busca
  const candidate =
    enabled && sig === settled
      ? (q.data ?? []).find((m) => !dismissed.includes(m.member_id))
      : undefined;
  const candidateId = candidate?.member_id;

  useEffect(() => {
    setConfirming(false);
    setConfirmCpf("");
    setNotice("");
  }, [candidateId]);

  if (!candidate) return null;

  async function claim(confirm: string) {
    if (!candidate) return;
    const k = JSON.parse(settled) as {
      cpf: string | null;
      phone: string | null;
      email: string | null;
      rg: string | null;
    };
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_member_match", {
      _member: candidate.member_id,
      _cpf: k.cpf ?? "",
      _phone: k.phone ?? "",
      _email: k.email ?? "",
      _rg: k.rg ?? "",
      _confirm_cpf: confirm,
    });
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
    if (data === "cpf_required") {
      setConfirming(true);
      setNotice("");
      return;
    }
    setNotice(MATCH_CLAIM_MESSAGES[data ?? ""] ?? "Não foi possível vincular agora.");
  }

  function itIsMe() {
    if (!candidate) return;
    if (!candidate.needs_cpf) return void claim("");
    if (!candidate.cpf_last2) return setNotice(MATCH_CLAIM_MESSAGES["no_cpf"] ?? "");
    setConfirming(true);
    setNotice("");
  }

  const by = matchedByText(candidate.matched_by);
  return (
    <Dialog open onOpenChange={(open) => !open && setDismissed((d) => [...d, candidate.member_id])}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a esse cadastro</DialogTitle>
          <DialogDescription>
            A igreja já tem um cadastro com{" "}
            {by ? `o ${by} que você digitou` : "os dados que você digitou"}. Confira se é você.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <MemberAvatar path={candidate.member_photo} size="h-24 w-24" />
          <p className="text-lg font-medium text-foreground">{candidate.member_name}</p>
          <dl className="space-y-1 text-sm">
            <div>
              <dt className="inline text-muted-foreground">CPF: </dt>
              <dd className="inline text-foreground">{maskedCpf(candidate.cpf_last2)}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">E-mail: </dt>
              <dd className="inline break-all text-foreground">
                {candidate.member_email || "não informado"}
              </dd>
            </div>
          </dl>
        </div>

        {confirming && (
          <div className="space-y-2 rounded-xl border bg-primary-soft p-4 text-sm">
            <p className="text-foreground">
              Para sua segurança, digite o CPF deste cadastro para confirmar que é você:
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={confirmCpf}
                onChange={(e) => setConfirmCpf(formatCpf(e.target.value))}
                className="max-w-52 bg-background"
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || !normCpf(confirmCpf)}
                onClick={() => void claim(confirmCpf)}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
        {notice && (
          <p role="alert" className="text-sm text-destructive">
            {notice}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setDismissed((d) => [...d, candidate.member_id])}
          >
            Não sou eu
          </Button>
          {!confirming && (
            <Button type="button" disabled={busy} onClick={itIsMe}>
              Sou eu
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
