import { useState } from "react";
import { toast } from "sonner";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptInstall, useInstallState } from "@/lib/pwa";

const DISMISS_KEY = "aava-install-dismissed";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

/** Cartão "Instalar o app" (Meu cadastro): explica e instala conforme o aparelho. */
export function InstallCard() {
  const state = useInstallState();
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    const r = await promptInstall().catch(() => "unavailable" as const);
    setBusy(false);
    if (r === "accepted") toast.success("App instalado! Procure o ícone da Aava na tela inicial.");
  }

  return (
    <section className="rounded-2xl border bg-card p-5 text-sm" aria-labelledby="install-title">
      <h2 id="install-title" className="flex items-center gap-2 font-display text-lg text-foreground">
        <Smartphone className="h-5 w-5 text-primary" aria-hidden /> Instalar o app da Aava
      </h2>

      {state === "installed" && <p className="mt-2 text-muted-foreground">Você já está usando o app. Ele abre direto na área de membros.</p>}

      {state !== "installed" && (
        <p className="mt-2 text-muted-foreground">
          Vira um ícone no celular ou no computador e abre direto na área de membros, sem passar pela página inicial. As notificações também aparecem com o ícone da Aava, em vez do ícone do navegador.
        </p>
      )}

      {state === "available" && (
        <Button className="mt-4" disabled={busy} onClick={install}>
          <Download className="h-4 w-4" /> Instalar app
        </Button>
      )}

      {state === "ios" && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            No Safari, toque em <Share className="inline h-4 w-4" aria-label="Compartilhar" /> <strong>Compartilhar</strong>.
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong> e confirme.
          </li>
          <li>Abra a Aava pelo ícone novo.</li>
        </ol>
      )}

      {state === "manual" && (
        <p className="mt-3 text-muted-foreground">
          No menu do navegador (⋮ ou ⋯), escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>. Se a opção não aparecer, o navegador pode não oferecer instalação.
        </p>
      )}
    </section>
  );
}

/** Convite discreto no painel (some se dispensar, se já instalou ou se o navegador não deixa instalar com 1 toque). */
export function InstallPrompt() {
  const state = useInstallState();
  const [hidden, setHidden] = useState(() => read(DISMISS_KEY) !== null);
  const [busy, setBusy] = useState(false);

  if (hidden || (state !== "available" && state !== "ios")) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sem armazenamento: volta na próxima visita */
    }
    setHidden(true);
  };

  return (
    <div role="region" aria-label="Instalar o app" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-primary-soft p-4 text-sm">
      <Smartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">
        {state === "available"
          ? "Instale o app da Aava: abre direto na área de membros e as notificações chegam com o ícone da igreja."
          : "Instale o app: toque em Compartilhar e depois em “Adicionar à Tela de Início”."}
      </p>
      {state === "available" && (
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await promptInstall().catch(() => undefined);
            setBusy(false);
          }}
        >
          Instalar
        </Button>
      )}
      <Button size="icon" variant="ghost" aria-label="Agora não" onClick={dismiss}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
