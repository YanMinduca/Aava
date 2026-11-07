import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/members/MemberForm", () => ({
  MemberAvatar: ({ path }: { path?: string | null }) => (
    <div data-testid="avatar">{path ?? "sem-foto"}</div>
  ),
}));

import { MemberMatchDialog } from "@/components/members/MemberMatchDialog";
import { matchKeys, matchedByText, maskedCpf, normEmail, normPhone } from "@/lib/member-match";

const match = {
  member_id: "m1",
  member_name: "José da Silva",
  cpf_last2: "09",
  member_email: "jose@igreja.com",
  member_photo: "m1/foto.jpg",
  matched_by: ["cpf"],
  needs_cpf: false,
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof MemberMatchDialog>> = {},
  onClaimed = vi.fn(),
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemberMatchDialog
        cpf="123.456.789-09"
        phone=""
        email=""
        rg=""
        enabled
        onClaimed={onClaimed}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onClaimed;
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
});

describe("member-match helpers", () => {
  it("só considera valores completos", () => {
    expect(
      matchKeys({ cpf: "123.456.789", phone: "(12) 9999", email: "joao@", rg: "12" }),
    ).toBeNull();
    expect(matchKeys({ cpf: "123.456.789-09" })).toEqual({
      cpf: "12345678909",
      phone: null,
      email: null,
      rg: null,
    });
  });

  it("normaliza telefone (com +55 e máscara) e e-mail", () => {
    expect(normPhone("+55 (12) 99999-0000")).toBe("12999990000");
    expect(normPhone("(12) 3333-4444")).toBe("1233334444");
    expect(normPhone("99999-0000")).toBeNull();
    expect(normEmail("  Jose@Igreja.COM ")).toBe("jose@igreja.com");
    expect(normEmail("jose@igreja")).toBeNull();
  });

  it("esconde o CPF deixando só os dois últimos dígitos", () => {
    expect(maskedCpf("09")).toBe("•••.•••.•••-09");
    expect(maskedCpf(null)).toBe("CPF não informado");
  });

  it("descreve por onde achou", () => {
    expect(matchedByText(["cpf"])).toBe("CPF");
    expect(matchedByText(["cpf", "telefone", "email"])).toBe("CPF, telefone e e-mail");
  });
});

describe("MemberMatchDialog", () => {
  it("não consulta o banco com dados incompletos", async () => {
    renderDialog({ cpf: "123.456", phone: "(12) 99", email: "a@", rg: "" });
    await new Promise((r) => setTimeout(r, 900));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não consulta quando a conta já tem cadastro", async () => {
    renderDialog({ enabled: false });
    await new Promise((r) => setTimeout(r, 900));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mostra nome, CPF mascarado, e-mail e foto e vincula com 'Sou eu'", async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === "find_member_matches" ? { data: [match], error: null } : { data: "ok", error: null },
    );
    const onClaimed = renderDialog();
    await screen.findByText("Vincular a esse cadastro", undefined, { timeout: 3000 });
    expect(screen.getByText("José da Silva")).toBeTruthy();
    expect(screen.getByText("•••.•••.•••-09")).toBeTruthy();
    expect(screen.queryByText(/123\.456\.789/)).toBeNull();
    expect(screen.getByText("jose@igreja.com")).toBeTruthy();
    expect(screen.getByTestId("avatar").textContent).toBe("m1/foto.jpg");
    expect(rpc).toHaveBeenCalledWith("find_member_matches", {
      _cpf: "12345678909",
      _phone: "",
      _email: "",
      _rg: "",
    });

    fireEvent.click(screen.getByText("Sou eu"));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("claim_member_match", {
      _member: "m1",
      _cpf: "12345678909",
      _phone: "",
      _email: "",
      _rg: "",
      _confirm_cpf: "",
    });
  });

  it("quando achou só pelo telefone, pede o CPF do cadastro antes de vincular", async () => {
    rpc.mockImplementation(async (fn: string, args: Record<string, string>) => {
      if (fn === "find_member_matches")
        return { data: [{ ...match, matched_by: ["telefone"], needs_cpf: true }], error: null };
      return {
        data: args["_confirm_cpf"]?.replace(/\D/g, "") === "12345678909" ? "ok" : "wrong_cpf",
        error: null,
      };
    });
    const onClaimed = renderDialog({ cpf: "", phone: "(12) 99999-0000" });
    await screen.findByText("Vincular a esse cadastro", undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText("Sou eu"));
    expect(rpc).not.toHaveBeenCalledWith("claim_member_match", expect.anything());

    const input = await screen.findByPlaceholderText("000.000.000-00");
    fireEvent.change(input, { target: { value: "00000000000" } });
    fireEvent.click(screen.getByText("Confirmar"));
    await screen.findByText(/CPF não confere/);
    expect(onClaimed).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "12345678909" } });
    fireEvent.click(screen.getByText("Confirmar"));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
  });

  it("cadastro sem CPF encontrado só por telefone manda procurar a secretaria", async () => {
    rpc.mockImplementation(async () => ({
      data: [{ ...match, cpf_last2: null, matched_by: ["telefone"], needs_cpf: true }],
      error: null,
    }));
    renderDialog({ cpf: "", phone: "(12) 99999-0000" });
    await screen.findByText("Vincular a esse cadastro", undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText("Sou eu"));
    await screen.findByText(/Procure a secretaria/);
    expect(screen.getByText("CPF não informado")).toBeTruthy();
  });

  it("'Não sou eu' fecha o pop-up e ele não volta para o mesmo cadastro", async () => {
    rpc.mockImplementation(async () => ({ data: [match], error: null }));
    renderDialog();
    await screen.findByText("Vincular a esse cadastro", undefined, { timeout: 3000 });
    fireEvent.click(screen.getByText("Não sou eu"));
    await waitFor(() => expect(screen.queryByText("Vincular a esse cadastro")).toBeNull());
  });
});
