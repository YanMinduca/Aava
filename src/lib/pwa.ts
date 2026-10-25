import { useSyncExternalStore } from "react";

/** Instalação do site como app (PWA) e abertura direto na área de membros. */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const inBrowser = () => typeof window !== "undefined" && typeof navigator !== "undefined";

/** Aberto como app instalado (sem a barra do navegador)? */
export const isStandalone = () =>
  inBrowser() &&
  (window.matchMedia?.("(display-mode: standalone)").matches === true || (navigator as { standalone?: boolean }).standalone === true);

export const isIos = () =>
  inBrowser() && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// O navegador avisa que dá para instalar uma vez só, logo no começo: guardamos o aviso aqui.
let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (inBrowser()) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** installed: já é app | available: dá para instalar com 1 toque | ios: precisa do passo a passo | manual: pelo menu do navegador */
export type InstallState = "installed" | "available" | "ios" | "manual";

export function getInstallState(): InstallState {
  if (isStandalone() || installed) return "installed";
  if (deferred) return "available";
  if (isIos()) return "ios";
  return "manual";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getInstallState,
    () => "manual",
  );
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred;
  deferred = null; // o aviso só pode ser usado uma vez
  emit();
  await ev.prompt();
  return (await ev.userChoice).outcome;
}

// Quem abre o app direto em "/" (ex.: iPhone antigo que guardou a página inicial) vai para a área de membros.
// Só na abertura do app: depois, "Ver site" dentro do app continua mostrando a página inicial.
let launchHandled = false;
const launchPath = inBrowser() ? window.location.pathname : "";
export function consumeLaunchRedirect(): boolean {
  if (launchHandled) return false;
  launchHandled = true;
  return isStandalone() && launchPath === "/";
}
