import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ClaimSuggestion } from "@/components/members/ClaimSuggestion";

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe("ClaimSuggestion", () => {
  it("não busca com nome de uma palavra só", async () => {
    render(<ClaimSuggestion name="Maria" onClaimed={() => {}} />);
    await new Promise((r) => setTimeout(r, 1100));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("pergunta 'Este é você?', pede o CPF e vincula quando confere", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "find_claimable_members" ? { data: [{ id: "m1", full_name: "José da Silva", has_cpf: true }] } : { data: "ok", error: null },
    );
    const onClaimed = vi.fn();
    render(<ClaimSuggestion name="Jose da Silva" onClaimed={onClaimed} />);
    await screen.findByText(/Este é você\?/, undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText("Sim, sou eu"));
    fireEvent.change(screen.getByPlaceholderText("000.000.000-00"), { target: { value: "123.456.789-09" } });
    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("claim_member", { _member: "m1", _cpf: "123.456.789-09" });
  });

  it("mostra erro quando o CPF não confere e some quando a pessoa responde 'Não'", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "find_claimable_members" ? { data: [{ id: "m1", full_name: "José da Silva", has_cpf: true }] } : { data: "wrong_cpf", error: null },
    );
    const onClaimed = vi.fn();
    render(<ClaimSuggestion name="Jose da Silva" onClaimed={onClaimed} />);
    await screen.findByText(/Este é você\?/, undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText("Sim, sou eu"));
    fireEvent.change(screen.getByPlaceholderText("000.000.000-00"), { target: { value: "00000000000" } });
    fireEvent.click(screen.getByText("Confirmar"));
    await screen.findByText(/CPF não confere/);
    expect(onClaimed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Cancelar"));
    fireEvent.click(screen.getByText("Não"));
    await waitFor(() => expect(screen.queryByText(/Este é você\?/)).toBeNull());
  });
});
