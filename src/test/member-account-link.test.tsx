import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountBadge, LinkAccountDialog, type AccountRow } from "@/components/members/MemberAccountLink";

const accounts: AccountRow[] = [
  { account_id: "u1", account_name: "Maria Souza", account_email: "maria@ex.com", member_id: null },
  { account_id: "u2", account_name: "João Lima", account_email: "joao@ex.com", member_id: "m9" },
  { account_id: "u3", account_name: "Ana Paula", account_email: "ana@ex.com", member_id: null },
];

function renderDialog(member: { id: string; full_name: string; user_id: string | null }, onClose = vi.fn()) {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><LinkAccountDialog member={member} accounts={accounts} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  vi.restoreAllMocks();
});

describe("AccountBadge", () => {
  it("mostra Com conta (e o e-mail) ou Sem conta", () => {
    render(<AccountBadge linked email="maria@ex.com" />);
    expect(screen.getByText("Com conta")).toBeTruthy();
    expect(screen.getByText("maria@ex.com")).toBeTruthy();
    cleanup();
    render(<AccountBadge linked={false} />);
    expect(screen.getByText("Sem conta")).toBeTruthy();
  });
});

describe("LinkAccountDialog", () => {
  it("lista só contas ainda não vinculadas e filtra pela busca", () => {
    renderDialog({ id: "m1", full_name: "Maria da Silva", user_id: null });
    expect(screen.getByText("Maria Souza")).toBeTruthy();
    expect(screen.getByText("Ana Paula")).toBeTruthy();
    expect(screen.queryByText("João Lima")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Buscar conta/), { target: { value: "ana@" } });
    expect(screen.queryByText("Maria Souza")).toBeNull();
    expect(screen.getByText("Ana Paula")).toBeTruthy();
  });

  it("vincula a conta escolhida ao cadastro", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rpc.mockResolvedValue({ data: "ok", error: null });
    const onClose = renderDialog({ id: "m1", full_name: "Maria da Silva", user_id: null });
    fireEvent.click(screen.getAllByText("Vincular")[0]!);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("link_member_account", { _member: "m1", _user: "u1" });
  });

  it("não chama o banco se o CEO cancelar a confirmação", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDialog({ id: "m1", full_name: "Maria da Silva", user_id: null });
    fireEvent.click(screen.getAllByText("Vincular")[0]!);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mostra a conta atual e permite desvincular", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rpc.mockResolvedValue({ data: "ok", error: null });
    const onClose = renderDialog({ id: "m9", full_name: "João Lima", user_id: "u2" });
    expect(screen.getByText("joao@ex.com")).toBeTruthy();
    fireEvent.click(screen.getByText("Desvincular conta"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("unlink_member_account", { _member: "m9" });
  });
});
