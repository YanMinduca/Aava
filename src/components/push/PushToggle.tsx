import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disablePush, enablePush, getPushState, pushErrorMessage, sendTestPush, type PushState } from "@/lib/push";

/** Cartão para ligar/desligar as notificações push neste aparelho (celular ou computador). */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => void getPushState().then(setState).catch(() => setState("unsupported")), []);
  useEffect(refresh, [refresh]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(pushErrorMessage(e));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  const turnOn = () =>
    run(async () => {
      await enablePush();
      toast.success("Notificações ativadas neste aparelho.");
      void sendTestPush().catch(() => undefined);
    });
  const turnOff = () =>
    run(async () => {
      await disablePush();
      toast.success("Notificações desativadas neste aparelho.");
    });
  const test = () =>
    run(async () => {
      const r = await sendTestPush();
      if (r.sent === 0) toast.error("Nenhum aparelho respondeu ao teste. Desative e ative de novo.");
      else toast.success("Teste enviado. Deve chegar em instantes.");
    });

  if (!state) return null;

  return (
    <section className="rounded-2xl border bg-card p-5 text-sm" aria-labelledby="push-title">
      <h2 id="push-title" className="flex items-center gap-2 font-display text-lg text-foreground">
        {state === "on" ? <Bell className="h-5 w-5 text-primary" aria-hidden /> : <BellOff className="h-5 w-5 text-muted-foreground" aria-hidden />}
        Notificações no celular e no computador
      </h2>

      {state === "unsupported" && (
        <p className="mt-2 text-muted-foreground">Este navegador não permite notificações push. Tente com o Chrome, Edge, Firefox ou Safari atualizados.</p>
      )}

      {state === "needs-install" && (
        <div className="mt-2 text-muted-foreground">
          <p>No iPhone e no iPad, as notificações só funcionam com o site instalado na tela de início:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              No Safari, toque em <Share className="inline h-4 w-4" aria-label="Compartilhar" /> <strong>Compartilhar</strong>.
            </li>
            <li>
              Escolha <strong>Adicionar à Tela de Início</strong>.
            </li>
            <li>Abra a Aava pelo ícone novo e volte a esta tela para ativar.</li>
          </ol>
        </div>
      )}

      {state === "denied" && (
        <p className="mt-2 text-muted-foreground">
          As notificações estão bloqueadas para este site. Toque no cadeado ao lado do endereço (ou nas configurações do navegador), mude “Notificações” para <strong>Permitir</strong> e volte aqui.
        </p>
      )}

      {state === "off" && (
        <>
          <p className="mt-2 text-muted-foreground">
            Receba avisos da Aava (novos eventos e recados da igreja) mesmo com o site fechado. Vale só para este aparelho; se quiser também em outro, ative lá.
          </p>
          <Button className="mt-4" disabled={busy} onClick={turnOn}>
            Ativar notificações
          </Button>
        </>
      )}

      {state === "on" && (
        <>
          <p className="mt-2 text-muted-foreground">Ativadas neste aparelho. Você recebe os avisos mesmo com o site fechado.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={test}>
              Enviar um teste
            </Button>
            <Button variant="ghost" disabled={busy} onClick={turnOff}>
              Desativar neste aparelho
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
