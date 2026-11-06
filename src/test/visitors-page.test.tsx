import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const state = vi.hoisted(() => ({
  access: { can: (_: string): boolean => true, isFullAccess: false, isLoading: false },
  members: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: { children: React.ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={params?.["id"] ? to.replace("$id", params["id"]) : to} {...rest}>{children}</a>
  ),
}));
vi.mock("@/hooks/use-access", () => ({ useAccess: () => state.access }));
vi.mock("@/hooks/use-members", () => ({ useAllMembers: () => ({ data: state.members, isLoading: false, isError: false }) }));
vi.mock("@/components/members/MemberForm", () => ({ MemberAvatar: () => <span /> }));
vi.mock("@/components/members/MemberAccountLink", () => ({
  useAccountLinks: () => ({ data: [] }),
  AccountBadge: ({ linked }: { linked: boolean }) => <span>{linked ? "Com conta" : "Sem conta"}</span>,
  LinkAccountDialog: () => null,
}));
vi.mock("@/lib/export", () => ({ downloadXls: vi.fn() }));

import { VisitorsPage } from "@/components/members/VisitorsPage";

const row = (over: Record<string, unknown>) => ({
  id: "x", full_name: "Fulano", status: "visitante", approval_status: "aprovado", email: null, phone: null, cpf: null, birth_date: null, photo_path: null,
  user_id: null, created_at: "2026-11-05T10:00:00Z", signup_source: null, signup_event_title: null, ...over,
});

describe("Página de visitantes", () => {
  afterEach(cleanup);

  it("lista só visitantes, com a origem do cadastro", () => {
    state.access = { can: () => true, isFullAccess: false, isLoading: false };
    state.members = [
      row({ id: "1", full_name: "Maria Visitante", signup_source: "event", signup_event_title: "Musical de Natal", user_id: "u1" }),
      row({ id: "2", full_name: "Pedro Membro", status: "membro" }),
      row({ id: "3", full_name: "Ana Sem Origem" }),
    ];
    render(<VisitorsPage />);
    expect(screen.getByText("Maria Visitante")).toBeTruthy();
    expect(screen.getByText("Ana Sem Origem")).toBeTruthy();
    expect(screen.queryByText("Pedro Membro")).toBeNull();
    expect(screen.getByText("Veio pelo evento: Musical de Natal")).toBeTruthy();
    expect(screen.getByText("Origem não registrada")).toBeTruthy();
    expect(screen.getByText(/2 visitantes · 1 com conta/)).toBeTruthy();
  });

  it("filtra por origem e por busca", () => {
    state.members = [
      row({ id: "1", full_name: "Maria Visitante", signup_source: "event", signup_event_title: "Musical de Natal" }),
      row({ id: "3", full_name: "Ana Sem Origem" }),
    ];
    render(<VisitorsPage />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "ana" } });
    const body = screen.getAllByRole("rowgroup")[1]!;
    expect(within(body).queryByText("Maria Visitante")).toBeNull();
    expect(within(body).getByText("Ana Sem Origem")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "natal" } });
    expect(within(screen.getAllByRole("rowgroup")[1]!).getByText("Maria Visitante")).toBeTruthy();
  });

  it("mostra mensagem quando não há visitantes", () => {
    state.members = [row({ id: "2", full_name: "Pedro Membro", status: "membro" })];
    render(<VisitorsPage />);
    expect(screen.getByText(/Nenhum visitante cadastrado ainda/)).toBeTruthy();
  });

  it("bloqueia quem não pode ver membros", () => {
    state.access = { can: () => false, isFullAccess: false, isLoading: false };
    render(<VisitorsPage />);
    expect(screen.getByText(/não tem acesso/)).toBeTruthy();
  });
});
