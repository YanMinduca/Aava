import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
const rows = [
  { id: "n1", kind: "manual", title: "Culto mudou", body: "Agora às 19h", audience: { type: "all" }, devices: 3, sent: 3, failed: 0, created_at: "2026-10-20T12:00:00Z" },
  { id: "n2", kind: "auto", title: "Novo evento: Retiro", body: "", audience: { type: "all" }, devices: 2, sent: 1, failed: 1, created_at: "2026-10-21T12:00:00Z" },
];

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    functions: { invoke: vi.fn() },
    from: (table: string) =>
      table === "push_notifications"
        ? { select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }
        : { select: () => ({ order: async () => ({ data: [], error: null }) }) },
  },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (cfg: object) => ({ ...cfg }) }));
vi.mock("@/hooks/use-access", () => ({ useAccess: () => ({ isLoading: false, can: () => true }) }));
vi.mock("@/lib/site-query", () => ({ siteMeta: () => ({}) }));

import { Route } from "@/routes/_authenticated/painel.notificacoes";

const Page = (Route as unknown as { component: () => ReactNode }).component;
const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

beforeEach(() => h.rpc.mockResolvedValue({ data: 1, error: null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("histórico de avisos: excluir", () => {
  it("apaga um aviso só depois de confirmar", async () => {
    render(wrap(<Page />));
    await screen.findByText("Culto mudou");
    fireEvent.click(screen.getByRole("button", { name: /Apagar o aviso Culto mudou do histórico/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(h.rpc).not.toHaveBeenCalledWith("delete_push_history", expect.anything());
    fireEvent.click(within(dialog).getByRole("button", { name: "Apagar" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("delete_push_history", { _ids: ["n1"] }));
  });

  it("limpa os registros com mais de 30 dias", async () => {
    render(wrap(<Page />));
    await screen.findByText("Culto mudou");
    fireEvent.click(screen.getByRole("button", { name: "Apagar com mais de 30 dias" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Apagar antigos" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("clear_push_history", { _older_than_days: 30 }));
  });

  it("apaga todo o histórico (de todos) com confirmação", async () => {
    render(wrap(<Page />));
    await screen.findByText("Culto mudou");
    fireEvent.click(screen.getByRole("button", { name: /Apagar tudo/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/de todos/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Apagar tudo" }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("clear_push_history", {}));
  });
});
