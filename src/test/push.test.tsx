import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  from: vi.fn(),
  can: vi.fn(() => true),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => h.rpc(...a), functions: { invoke: (...a: unknown[]) => h.invoke(...a) }, from: (...a: unknown[]) => h.from(...a) },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (cfg: object) => ({ ...cfg }) }));
vi.mock("@/hooks/use-access", () => ({ useAccess: () => ({ isLoading: false, can: h.can }) }));
vi.mock("@/lib/site-query", () => ({ siteMeta: () => ({}) }));

import { disablePush, enablePush, getPushState, pushOptedOut, syncPush, urlBase64ToBytes } from "@/lib/push";
import { PushToggle } from "@/components/push/PushToggle";
import { Route as NotificationsRoute } from "@/routes/_authenticated/painel.notificacoes";

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

/** Navegador de mentira com suporte a push; devolve os "espiões" para conferir. */
function fakeBrowser(opts: { permission?: NotificationPermission; subscribed?: boolean; ua?: string } = {}) {
  const sub = {
    endpoint: "https://push.example/abc",
    options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
    toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "P256", auth: "AUTH" } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(opts.subscribed ? sub : null),
    subscribe: vi.fn().mockResolvedValue(sub),
  };
  const reg = { pushManager };
  const requestPermission = vi.fn().mockResolvedValue("granted");
  vi.stubGlobal("Notification", Object.assign(function () {}, { permission: opts.permission ?? "default", requestPermission }));
  Object.defineProperty(window, "PushManager", { value: class {}, configurable: true });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(reg), ready: Promise.resolve(reg), getRegistration: vi.fn().mockResolvedValue(opts.subscribed ? reg : undefined) },
  });
  if (opts.ua) Object.defineProperty(navigator, "userAgent", { value: opts.ua, configurable: true });
  return { sub, pushManager, requestPermission };
}

function noBrowserPush() {
  vi.unstubAllGlobals();
  // @ts-expect-error remover o suporte simulado
  delete window.PushManager;
  // @ts-expect-error remover o suporte simulado
  delete navigator.serviceWorker;
}

beforeEach(() => {
  localStorage.clear();
  h.rpc.mockResolvedValue({ data: null, error: null });
  h.invoke.mockResolvedValue({ data: { publicKey: "AQID" }, error: null });
});
afterEach(() => {
  cleanup();
  noBrowserPush();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("service worker (public/sw.js)", () => {
  function loadWorker(openWindows: { url: string }[] = []) {
    const listeners: Record<string, (e: unknown) => void> = {};
    const shown: { title: string; opts: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: "https://aava.example" },
      skipWaiting: vi.fn(),
      clients: {
        claim: vi.fn(),
        matchAll: vi.fn().mockResolvedValue(openWindows),
        openWindow: vi.fn(async (u: string) => void opened.push(u)),
      },
      registration: { showNotification: vi.fn(async (title: string, opts: Record<string, unknown>) => void shown.push({ title, opts })) },
      addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners[t] = fn),
    };
    new Function("self", readFileSync("public/sw.js", "utf8"))(self);
    return { listeners, shown, opened, self };
  }
  const waitable = () => {
    const ps: Promise<unknown>[] = [];
    return { waitUntil: (p: Promise<unknown>) => void ps.push(p), done: () => Promise.all(ps) };
  };

  it("mostra a notificação com título, texto, tag e link do aviso", async () => {
    const w = loadWorker();
    const e = waitable();
    w.listeners["push"]!({ ...e, data: { json: () => ({ title: "Novo evento: Culto", body: "12/11 às 19h", url: "/eventos/culto", tag: "evento-1" }) } });
    await e.done();
    expect(w.shown[0]!.title).toBe("Novo evento: Culto");
    expect(w.shown[0]!.opts).toMatchObject({ body: "12/11 às 19h", tag: "evento-1", data: { url: "/eventos/culto" }, icon: "/icon-192.png", badge: "/badge-96.png" });
  });

  it("aviso sem dados ainda mostra algo útil em vez de falhar", async () => {
    const w = loadWorker();
    const e = waitable();
    w.listeners["push"]!({ ...e, data: null });
    await e.done();
    expect(w.shown[0]!.title).toBe("Comunidade Aava");
  });

  it("ao tocar: abre a página do aviso; link externo é trocado pelo painel", async () => {
    const w = loadWorker();
    for (const [url, esperado] of [["/eventos/culto", "https://aava.example/eventos/culto"], ["https://malvado.example/x", "https://aava.example/painel"]] as const) {
      const e = waitable();
      w.listeners["notificationclick"]!({ ...e, notification: { close: vi.fn(), data: { url } } });
      await e.done();
      expect(w.opened.at(-1)).toBe(esperado);
    }
  });

  it("ao tocar com o site já aberto: reaproveita a janela em vez de abrir outra", async () => {
    const win = { url: "https://aava.example/painel", focus: vi.fn(), navigate: vi.fn() };
    const w = loadWorker([win]);
    const e = waitable();
    w.listeners["notificationclick"]!({ ...e, notification: { close: vi.fn(), data: { url: "/painel/oracao" } } });
    await e.done();
    expect(win.focus).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith("https://aava.example/painel/oracao");
    expect(w.opened).toHaveLength(0);
  });
});

describe("biblioteca de push", () => {
  it("converte a chave pública (base64 de URL) em bytes", () => {
    expect([...urlBase64ToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...urlBase64ToBytes("-_8")]).toEqual([251, 255]);
  });

  it("descreve a situação do aparelho", async () => {
    expect(await getPushState()).toBe("unsupported");
    fakeBrowser({ permission: "denied" });
    expect(await getPushState()).toBe("denied");
    fakeBrowser({ permission: "default" });
    expect(await getPushState()).toBe("off");
    fakeBrowser({ permission: "granted", subscribed: true });
    expect(await getPushState()).toBe("on");
  });

  it("iPhone com o site aberto no Safari (sem instalar) recebe a orientação de instalar", async () => {
    noBrowserPush();
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", configurable: true });
    expect(await getPushState()).toBe("needs-install");
  });

  it("ativar: pede permissão, assina com a chave do servidor e registra no banco", async () => {
    const b = fakeBrowser();
    await enablePush();
    expect(b.requestPermission).toHaveBeenCalled();
    expect(h.invoke).toHaveBeenCalledWith("push", { body: { action: "public_key" } });
    expect(b.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(h.rpc).toHaveBeenCalledWith("save_push_subscription", expect.objectContaining({ _endpoint: "https://push.example/abc", _p256dh: "P256", _auth: "AUTH" }));
  });

  it("permissão negada não assina nada", async () => {
    const b = fakeBrowser();
    b.requestPermission.mockResolvedValue("denied");
    await expect(enablePush()).rejects.toThrow("push_denied");
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("assinatura antiga com chave diferente é trocada", async () => {
    const b = fakeBrowser({ subscribed: true }); // chave do aparelho [1,2,3]
    h.invoke.mockResolvedValue({ data: { publicKey: "BAUG" }, error: null }); // chave nova [4,5,6]
    await enablePush();
    expect(b.sub.unsubscribe).toHaveBeenCalled();
    expect(b.pushManager.subscribe).toHaveBeenCalled();
  });

  it("desativar: remove do banco, cancela a assinatura e lembra que foi de propósito", async () => {
    const b = fakeBrowser({ permission: "granted", subscribed: true });
    await disablePush();
    expect(h.rpc).toHaveBeenCalledWith("delete_push_subscription", { _endpoint: "https://push.example/abc" });
    expect(b.sub.unsubscribe).toHaveBeenCalled();
    expect(pushOptedOut()).toBe(true);
  });

  it("sincronizar ao abrir o painel: renova se já tem permissão, mas respeita quem desligou", async () => {
    const b = fakeBrowser({ permission: "granted", subscribed: true });
    await syncPush();
    expect(h.rpc).toHaveBeenCalledWith("save_push_subscription", expect.anything());
    h.rpc.mockClear();
    await disablePush();
    h.rpc.mockClear();
    await syncPush();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(b.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("sincronizar não pede permissão a quem nunca ativou", async () => {
    const b = fakeBrowser({ permission: "default" });
    await syncPush();
    expect(b.requestPermission).not.toHaveBeenCalled();
  });
});

describe("cartão de notificações (Meu cadastro)", () => {
  it("desligado: oferece ativar; ao ativar, registra e manda um teste", async () => {
    fakeBrowser({ permission: "default" });
    render(<PushToggle />);
    fireEvent.click(await screen.findByText("Ativar notificações"));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("save_push_subscription", expect.anything()));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith("push", { body: { action: "test" } }));
  });

  it("bloqueado no navegador: explica como liberar", async () => {
    fakeBrowser({ permission: "denied" });
    render(<PushToggle />);
    await screen.findByText(/estão bloqueadas para este site/);
    expect(screen.queryByText("Ativar notificações")).toBeNull();
  });

  it("iPhone sem instalar: mostra o passo a passo", async () => {
    noBrowserPush();
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", configurable: true });
    render(<PushToggle />);
    await screen.findByText(/Adicionar à Tela de Início/);
  });
});

describe("tela de envio de avisos", () => {
  const Page = (NotificationsRoute as unknown as { component: () => ReactNode }).component;
  const setup = () => {
    h.from.mockReturnValue({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }), then: (r: (v: unknown) => void) => r({ data: [{ id: "d1", name: "Louvor" }], error: null }) }) }) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  };

  it("sem a permissão send_push, não mostra o formulário", () => {
    h.can.mockReturnValueOnce(false);
    render(wrap(<Page />));
    expect(screen.getByText(/não tem permissão/)).toBeTruthy();
  });

  it("envia o aviso para o público escolhido e mostra o resultado", async () => {
    setup();
    h.invoke.mockResolvedValue({ data: { recipients: 3, devices: 4, sent: 4, failed: 0 }, error: null });
    render(wrap(<Page />));
    const send = screen.getByRole("button", { name: /Enviar aviso/ }) as HTMLButtonElement;
    expect(send.disabled).toBe(true); // sem título não envia
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: "Culto mudou de horário" } });
    fireEvent.change(screen.getByLabelText(/Mensagem/), { target: { value: "Agora às 19h." } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("push", { body: { action: "send", title: "Culto mudou de horário", body: "Agora às 19h.", url: "/painel", audience: { type: "members" } } }),
    );
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining("4 aparelhos")));
  });
});
