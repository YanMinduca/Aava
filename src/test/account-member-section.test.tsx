import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({
  linked: null as null | { id: string; full_name: string; status: string },
  rpc: vi.fn(async () => ({ data: "ok", error: null })),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={params?.["id"] ? to.replace("$id", params["id"]) : to} {...rest}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const candidates = [
    { id: "m1", full_name: "Carlos Souza", email: "carlos@x.com", phone: null, status: "membro" },
    { id: "m2", full_name: "Joana Lima", email: "joana@x.com", phone: null, status: "visitante" },
  ];
  const builder = (kind: "linked" | "candidates") => {
    const result = () => ({ data: kind === "linked" ? state.linked : candidates, error: null });
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order"]) b[k] = () => b;
    b["maybeSingle"] = () => Promise.resolve(result());
    b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
    return b;
  };
  return {
    supabase: {
      from: () => {
        // a primeira consulta (cadastro ligado) usa maybeSingle; a lista de candidatos usa .is(user_id, null)
        const linkedB = builder("linked");
        const candB = builder("candidates");
        const b: Record<string, unknown> = {};
        b["select"] = () => b;
        b["eq"] = () => linkedB;
        b["is"] = () => candB;
        return b;
      },
      rpc: (...args: unknown[]) => (state.rpc as (...a: unknown[]) => unknown)(...args),
    },
  };
});

import { AccountMemberSection } from "@/components/admin/AccountMemberSection";

const user = { id: "u1", name: "Joana Lima", email: "joana@x.com" };
const renderIt = (props: { canView?: boolean; canLink?: boolean } = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AccountMemberSection user={user} canView={props.canView ?? true} canLink={props.canLink ?? true} />
    </QueryClientProvider>,
  );

describe("Vínculo de conta em Usuários e permissões", () => {
  beforeEach(() => {
    state.linked = null;
    state.rpc.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(cleanup);

  it("mostra o cadastro quando a conta já está vinculada e permite desvincular", async () => {
    state.linked = { id: "m9", full_name: "Joana Lima", status: "visitante" };
    renderIt();
    const link = await screen.findByRole("link", { name: "Joana Lima" });
    expect(link.getAttribute("href")).toBe("/painel/membro/m9");
    expect(screen.getByText("Visitante")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Desvincular/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("unlink_member_account", { _member: "m9" }));
  });

  it("avisa quando não há vínculo e vincula dali mesmo, com sugestão primeiro", async () => {
    renderIt();
    expect(await screen.findByText(/não está vinculada/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Vincular a um cadastro/ }));

    expect(await screen.findByText("Sugestão")).toBeTruthy();
    const rows = await screen.findAllByRole("button", { name: "Vincular" });
    expect(rows.length).toBe(2);
    // Joana Lima (mesmo e-mail e nome da conta) vem primeiro
    fireEvent.click(rows[0]!);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("link_member_account", { _member: "m2", _user: "u1" }));
  });

  it("sem permissão para vincular, só mostra o estado", async () => {
    renderIt({ canLink: false });
    expect(await screen.findByText(/Somente o CEO e o Pastor Presidente/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Vincular a um cadastro/ })).toBeNull();
  });

  it("não aparece para quem não pode ver cadastros", () => {
    const { container } = renderIt({ canView: false });
    expect(container.textContent).toBe("");
  });
});
