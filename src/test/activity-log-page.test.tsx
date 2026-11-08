import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  access: { isCeo: true, isLoading: false },
  rpc: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/hooks/use-access", () => ({ useAccess: () => h.access }));
vi.mock("@/lib/site-query", () => ({ siteMeta: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));

import { PERMISSION_GROUPS, ROLE_LABELS } from "@/lib/church";
import { Route } from "@/routes/_authenticated/painel.atividades";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: crypto.randomUUID(),
  created_at: "2026-11-07T15:00:00Z",
  actor_id: "u1",
  actor_name: "Ana Admin",
  action: "update",
  entity: "members",
  summary: "Membro editado: Maria Souza",
  changed_fields: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.access = { isCeo: true, isLoading: false };
  h.rpc.mockResolvedValue({ data: [], error: null });
});
afterEach(cleanup);

describe("Registro de atividades (só CEO)", () => {
  it("quem não é CEO vê aviso de acesso restrito e nada é consultado", () => {
    h.access = { isCeo: false, isLoading: false };
    render(<Page />);
    expect(screen.getByText("Acesso restrito")).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("enquanto o acesso carrega, não pisca a tela de acesso restrito", () => {
    h.access = { isCeo: false, isLoading: true };
    render(<Page />);
    expect(screen.queryByText("Acesso restrito")).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("o CEO carrega a primeira página com os filtros vazios", async () => {
    render(<Page />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("activity_log_feed", {
      _limit: 50,
      _before: null,
      _entity: null,
      _search: null,
    });
    expect(await screen.findByText("Ainda não há atividades registradas.")).toBeTruthy();
  });

  it("mostra quem fez, o quê e traduz códigos de função e permissão para português", async () => {
    const roleKey = Object.keys(ROLE_LABELS).find((k) => k !== "member")!;
    const perm = PERMISSION_GROUPS.flatMap((g) => g.perms)[0]!;
    h.rpc.mockResolvedValue({
      data: [
        row({
          summary: `Função "${roleKey}" atribuída a João Silva`,
          action: "create",
          entity: "access",
        }),
        row({
          summary: `Permissão "${perm.key}" concedida a João Silva`,
          action: "create",
          entity: "access",
        }),
        row({
          summary: "Membro editado: Maria Souza",
          changed_fields: ["cpf", "phone", "campo_desconhecido"],
        }),
      ],
      error: null,
    });
    render(<Page />);
    expect(
      await screen.findByText(`Função "${ROLE_LABELS[roleKey]}" atribuída a João Silva`),
    ).toBeTruthy();
    expect(screen.getByText(`Permissão "${perm.label}" concedida a João Silva`)).toBeTruthy();
    expect(screen.getByText("Campos alterados: CPF, telefone, campo_desconhecido")).toBeTruthy();
    expect(screen.getAllByText("Ana Admin").length).toBe(3);
  });

  it("registro sem autor aparece como Sistema", async () => {
    h.rpc.mockResolvedValue({
      data: [row({ actor_name: null, summary: "Conta excluída: Fulano" })],
      error: null,
    });
    render(<Page />);
    expect(await screen.findByText("Sistema")).toBeTruthy();
  });

  it("o filtro por área consulta de novo com a área escolhida", async () => {
    render(<Page />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Financeiro" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenLastCalledWith("activity_log_feed", {
        _limit: 50,
        _before: null,
        _entity: "financial",
        _search: null,
      }),
    );
    expect(screen.getByRole("button", { name: "Financeiro" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("a busca espera o CEO parar de digitar e então consulta", async () => {
    render(<Page />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Buscar no registro de atividades"), {
      target: { value: "  Maria " },
    });
    expect(h.rpc).toHaveBeenCalledTimes(1);
    await waitFor(
      () =>
        expect(h.rpc).toHaveBeenLastCalledWith("activity_log_feed", {
          _limit: 50,
          _before: null,
          _entity: null,
          _search: "Maria",
        }),
      { timeout: 2000 },
    );
    expect(await screen.findByText("Nada encontrado com esse filtro.")).toBeTruthy();
  });

  it("com 50 registros aparece Carregar mais, que continua a partir do último", async () => {
    const page1 = Array.from({ length: 50 }, (_, i) =>
      row({
        id: `a${i}`,
        created_at: new Date(Date.UTC(2026, 10, 7, 12, 0, 59 - i)).toISOString(),
      }),
    );
    const lastDate = page1[49]!.created_at;
    h.rpc.mockResolvedValueOnce({ data: page1, error: null }).mockResolvedValueOnce({
      data: [row({ id: "b1", summary: "Evento criado: Natal" })],
      error: null,
    });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Carregar mais" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenLastCalledWith("activity_log_feed", {
        _limit: 50,
        _before: lastDate,
        _entity: null,
        _search: null,
      }),
    );
    expect(await screen.findByText("Evento criado: Natal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("menos de 50 registros: não oferece Carregar mais", async () => {
    h.rpc.mockResolvedValue({ data: [row()], error: null });
    render(<Page />);
    await screen.findByText("Membro editado: Maria Souza");
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("acesso negado pelo banco vira mensagem clara", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "Acesso negado" } });
    render(<Page />);
    expect(await screen.findByText("Só o CEO pode ver o registro de atividades.")).toBeTruthy();
  });

  it("falha genérica mostra mensagem para tentar de novo, sem texto técnico", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "connection reset by peer" } });
    render(<Page />);
    expect(await screen.findByText(/Não foi possível carregar o registro/)).toBeTruthy();
    expect(screen.queryByText(/connection reset/)).toBeNull();
  });
});
