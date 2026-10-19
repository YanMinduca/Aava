import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  perms: new Set<string>(),
  rpc: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  resend: vi.fn(),
  purge: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Chain = { select: () => Chain; or: () => Chain; order: () => Chain; limit: () => Chain; then: (r: (v: { data: unknown[] }) => unknown) => unknown };
const chain = (): Chain => {
  const o: Chain = { select: () => o, or: () => o, order: () => o, limit: () => o, then: (r) => r({ data: [] }) };
  return o;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    from: () => chain(),
    storage: { from: (b: string) => ({ remove: (p: string[]) => h.remove(b, p), list: (d: string, o: unknown) => h.list(b, d, o) }) },
    auth: { resend: (...a: unknown[]) => h.resend(...a) },
  },
}));
vi.mock("@/hooks/use-access", () => ({
  useAccess: () => ({ can: (p: string) => h.perms.has(p), isFullAccess: false, isLoading: false, data: { uid: "u1" } }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/storage-trash", async (orig) => ({ ...(await orig<typeof import("@/lib/storage-trash")>()), purgeStorageTrash: h.purge }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

import { DeleteUserSection } from "@/components/admin/UserAdmin";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { EventsCard, FinanceCards, PrayerCard, VolunteerCards } from "@/components/dashboard/DashboardCards";
import { ClaimedNotice } from "@/components/members/ClaimSuggestion";
import { RESEND_INTERVAL_MS, type ResendStore } from "@/lib/resend-limit";

const wrap = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);
beforeEach(() => {
  h.perms.clear();
  Object.values(h).forEach((v) => (typeof v === "function" && "mockReset" in v ? (v as ReturnType<typeof vi.fn>).mockReset() : null));
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.rpc.mockImplementation(async (fn: string) => (fn === "dashboard_volunteer_stats" ? { data: { departments: 2, volunteers: 5 }, error: null } : { data: [], error: null }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("painel do membro (sem permissões de administração)", () => {
  it("não mostra voluntários, departamentos, saldo, dizimistas, metas nem pedidos de oração; mostra os eventos", async () => {
    const { container } = render(wrap(<><VolunteerCards /><FinanceCards /><PrayerCard /><EventsCard /></>));
    await waitFor(() => expect(screen.getByText("Eventos")).toBeTruthy());
    const text = container.textContent ?? "";
    for (const forbidden of ["Voluntários", "Departamentos", "Dizimistas", "Metas financeiras", "Pedido de oração"]) expect(text).not.toContain(forbidden);
    expect(h.rpc).not.toHaveBeenCalledWith("dashboard_volunteer_stats");
  });

  it("quem tem a permissão de departamentos vê voluntários e departamentos", async () => {
    h.perms.add("view_departments");
    render(wrap(<VolunteerCards />));
    await waitFor(() => expect(screen.getByText("Voluntários")).toBeTruthy());
    expect(screen.getByText("Departamentos")).toBeTruthy();
    expect(await screen.findByText("5")).toBeTruthy();
  });

  it("quem tem a permissão do financeiro vê dizimistas e metas", async () => {
    h.perms.add("view_finance");
    render(wrap(<FinanceCards />));
    await waitFor(() => expect(screen.getByText("Dizimistas")).toBeTruthy());
    expect(screen.getByText("Metas financeiras")).toBeTruthy();
  });
});

describe("aviso depois de vincular o cadastro", () => {
  it("pede para atualizar a página e o botão recarrega", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<ClaimedNotice />);
    expect(screen.getByText("Cadastro vinculado com sucesso!")).toBeTruthy();
    expect(screen.getByText(/Atualize a página/)).toBeTruthy();
    fireEvent.click(screen.getByText("Atualizar página"));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("reenviar e-mail de confirmação", () => {
  const memory = (): ResendStore => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it("libera o botão, reenvia até 3 vezes com 1 minuto de intervalo e depois bloqueia", async () => {
    vi.useFakeTimers();
    h.resend.mockResolvedValue({ error: null });
    render(<ResendConfirmation email="ana@teste.com" redirectTo="https://site/painel" store={memory()} />);
    const btn = () => screen.getByRole("button", { name: /Reenviar e-mail de confirmação/ }) as HTMLButtonElement;

    for (let i = 1; i <= 3; i++) {
      expect(btn().disabled).toBe(false);
      await act(async () => { fireEvent.click(btn()); await Promise.resolve(); });
      expect(h.resend).toHaveBeenCalledTimes(i);
      if (i < 3) {
        expect(btn().disabled).toBe(true);
        expect(btn().textContent).toMatch(/aguarde \d+s/);
        await act(async () => { vi.advanceTimersByTime(RESEND_INTERVAL_MS + 1000); });
      }
    }
    await act(async () => { vi.advanceTimersByTime(RESEND_INTERVAL_MS * 5); });
    expect(btn().disabled).toBe(true);
    expect(screen.getByText(/Você já usou os 3 reenvios/)).toBeTruthy();
    expect(h.resend).toHaveBeenCalledWith({ type: "signup", email: "ana@teste.com", options: { emailRedirectTo: "https://site/painel" } });
  });

  it("não gasta um reenvio quando o envio falha", async () => {
    vi.useFakeTimers();
    h.resend.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
    render(<ResendConfirmation email="ana@teste.com" redirectTo="x" store={memory()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Reenviar/ })); await Promise.resolve(); });
    expect(h.toast.error).toHaveBeenCalledWith("Aguarde um pouco antes de pedir um novo e-mail.");
    expect(screen.getByText(/Restam 3 reenvios/)).toBeTruthy();
  });
});

describe("excluir usuário", () => {
  it("só habilita depois de digitar EXCLUIR e manda a opção de apagar também o cadastro", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const onDeleted = vi.fn();
    render(wrap(<DeleteUserSection user={{ id: "u9", name: "Maria" }} onDeleted={onDeleted} />));
    fireEvent.click(screen.getByRole("button", { name: /Excluir usuário/ }));
    const confirm = await screen.findByRole("button", { name: "Excluir para sempre" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "excluir" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("delete_user_account", { _user: "u9", _delete_member: true });
    expect(h.purge).toHaveBeenCalled();
  });

  it("mostra mensagem clara quando o banco recusa", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "cannot_delete_ceo" } });
    render(wrap(<DeleteUserSection user={{ id: "u9", name: "Maria" }} onDeleted={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /Excluir usuário/ }));
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "EXCLUIR" } });
    fireEvent.click(screen.getByRole("button", { name: "Excluir para sempre" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("A conta do CEO não pode ser excluída."));
  });
});
