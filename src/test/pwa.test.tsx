import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const standalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (q: string) => ({ matches: on && q.includes("standalone"), addEventListener() {}, removeEventListener() {} }) });
const setUa = (ua: string) => Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
const fresh = async () => {
  vi.resetModules(); // o módulo guarda estado (aviso de instalação, abertura do app): cada teste começa do zero
  return import("@/lib/pwa");
};
function installable(outcome: "accepted" | "dismissed" = "accepted") {
  const ev = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  });
  window.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  standalone(false);
  setUa("Mozilla/5.0 (X11; Linux x86_64) Chrome/130");
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("abrir o app direto na área de membros", () => {
  it("app instalado aberto na página inicial vai para o painel, uma única vez", async () => {
    standalone(true);
    const pwa = await fresh();
    expect(pwa.consumeLaunchRedirect()).toBe(true);
    // depois, 'Ver site' dentro do app continua mostrando a página inicial
    expect(pwa.consumeLaunchRedirect()).toBe(false);
  });

  it("no navegador comum, a página inicial continua sendo a página inicial", async () => {
    const pwa = await fresh();
    expect(pwa.consumeLaunchRedirect()).toBe(false);
  });

  it("app aberto em outra página (ex.: pelo link de uma notificação) não é desviado", async () => {
    standalone(true);
    window.history.pushState({}, "", "/eventos/culto");
    const pwa = await fresh();
    expect(pwa.consumeLaunchRedirect()).toBe(false);
  });
});

describe("instalar como app", () => {
  it("descreve a situação: já instalado, instalável com 1 toque, iPhone ou pelo menu", async () => {
    let pwa = await fresh();
    expect(pwa.getInstallState()).toBe("manual");
    installable();
    expect(pwa.getInstallState()).toBe("available");

    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    pwa = await fresh();
    expect(pwa.getInstallState()).toBe("ios");

    standalone(true);
    pwa = await fresh();
    expect(pwa.getInstallState()).toBe("installed");
  });

  it("instalar chama o pedido do navegador e depois não oferece de novo", async () => {
    const pwa = await fresh();
    const ev = installable("accepted");
    expect(await pwa.promptInstall()).toBe("accepted");
    expect(ev.prompt).toHaveBeenCalledOnce();
    expect(await pwa.promptInstall()).toBe("unavailable");
  });

  it("depois de instalar, marca como instalado", async () => {
    const pwa = await fresh();
    installable();
    window.dispatchEvent(new Event("appinstalled"));
    expect(pwa.getInstallState()).toBe("installed");
  });
});

describe("cartão de instalar", () => {
  it("instalável: o botão instala", async () => {
    await fresh();
    const { InstallCard } = await import("@/components/pwa/InstallApp");
    const ev = installable();
    render(<InstallCard />);
    fireEvent.click(await screen.findByText("Instalar app"));
    await waitFor(() => expect(ev.prompt).toHaveBeenCalled());
  });

  it("iPhone: mostra o passo a passo", async () => {
    setUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)");
    await fresh();
    const { InstallCard } = await import("@/components/pwa/InstallApp");
    render(<InstallCard />);
    await screen.findByText(/Adicionar à Tela de Início/);
  });

  it("já instalado: avisa que abre direto na área de membros", async () => {
    standalone(true);
    await fresh();
    const { InstallCard } = await import("@/components/pwa/InstallApp");
    render(<InstallCard />);
    await screen.findByText(/Você já está usando o app/);
  });

  it("o convite do painel só aparece quando dá para instalar e some ao dispensar", async () => {
    localStorage.clear();
    await fresh();
    const { InstallPrompt } = await import("@/components/pwa/InstallApp");
    const { container, rerender } = render(<InstallPrompt />);
    expect(container.textContent).toBe(""); // navegador ainda não avisou
    act(() => {
      installable();
    });
    rerender(<InstallPrompt />);
    await screen.findByText(/Instale o app da Aava/);
    fireEvent.click(screen.getByLabelText("Agora não"));
    await waitFor(() => expect(screen.queryByText(/Instale o app da Aava/)).toBeNull());
    expect(localStorage.getItem("aava-install-dismissed")).toBe("1");
  });
});

describe("arquivos do app (manifesto e ícones)", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

  it("abre direto no painel e é instalável (ícones 192, 512 e maskable existem)", () => {
    expect(manifest.start_url).toBe("/painel");
    expect(manifest.display).toBe("standalone");
    for (const need of [{ sizes: "192x192", purpose: "any" }, { sizes: "512x512", purpose: "any" }, { sizes: "512x512", purpose: "maskable" }]) {
      const icon = manifest.icons.find((i: { sizes: string; purpose: string }) => i.sizes === need.sizes && i.purpose === need.purpose);
      expect(icon, `ícone ${need.sizes} ${need.purpose}`).toBeTruthy();
      expect(existsSync(`public${icon.src}`)).toBe(true);
    }
    for (const s of manifest.shortcuts) expect(s.url.startsWith("/")).toBe(true);
  });

  it("o ícone das notificações é uma silhueta com transparência (senão o Android mostra um quadrado)", () => {
    const png = readFileSync("public/badge-96.png");
    expect(png.readUInt32BE(16)).toBe(96); // largura
    expect(png[25]).toBe(6); // tipo de cor 6 = RGBA (tem canal de transparência)
  });
});
