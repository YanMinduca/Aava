import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enablePush, getPushState, pushErrorMessage, pushOptedOut, sendTestPush } from "@/lib/push";

const DISMISS_KEY = "aava-push-dismissed";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Convite discreto no painel para ativar as notificações (some se a pessoa dispensar ou já ativou). */
export function PushPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (read(DISMISS_KEY) || pushOptedOut()) return;
    void getPushState().then((s) => setShow(s === "off"));
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sem armazenamento: o convite volta na próxima visita */
    }
    setShow(false);
  };

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush();
      toast.success("Notificações ativadas neste aparelho.");
      void sendTestPush().catch(() => undefined);
      setShow(false);
    } catch (e) {
      toast.error(pushErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Ativar notificações" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border bg-primary-soft p-4 text-sm">
      <Bell className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">Quer receber os avisos da Aava neste aparelho, mesmo com o site fechado?</p>
      <Button size="sm" disabled={busy} onClick={turnOn}>
        Ativar
      </Button>
      <Button size="icon" variant="ghost" aria-label="Agora não" onClick={dismiss}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
