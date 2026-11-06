import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const tables = vi.hoisted(() => ({
  member_activity: [
    { id: "1", kind: "member_created", member_id: "m1", user_id: null, created_at: "2026-11-05T10:00:00Z", account_name: null, account_email: null },
    { id: "2", kind: "member_created", member_id: "m2", user_id: null, created_at: "2026-11-04T10:00:00Z", account_name: null, account_email: null },
  ] as unknown[],
  members: [
    { id: "m1", full_name: "Maria Visitante", status: "visitante" },
    { id: "m2", full_name: "Pedro Membro", status: "membro" },
  ] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = (data: unknown) => {
    const b: Record<string, unknown> = {};
    for (const k of ["select", "order", "limit", "in"]) b[k] = () => b;
    b["then"] = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res, rej);
    return b;
  };
  return { supabase: { from: (t: "member_activity" | "members") => builder(tables[t]) } };
});

import { RecentActivity } from "@/components/members/RecentActivity";

const renderIt = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecentActivity enabled />
    </QueryClientProvider>,
  );

describe("Atividade recente recolhível", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("começa recolhida e só mostra o resumo", async () => {
    renderIt();
    expect(await screen.findByText("2 atividades")).toBeTruthy();
    expect(screen.queryByText(/Novo visitante cadastrado/)).toBeNull();
    expect(screen.getByRole("button", { name: /Atividade recente/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("abre, diferencia visitante de membro, e lembra a escolha", async () => {
    const first = renderIt();
    await screen.findByText("2 atividades");
    fireEvent.click(screen.getByRole("button", { name: /Atividade recente/ }));
    expect(await screen.findByText("Novo visitante cadastrado: Maria Visitante")).toBeTruthy();
    expect(screen.getByText("Novo membro cadastrado: Pedro Membro")).toBeTruthy();
    expect(window.localStorage.getItem("aava:membros:atividade-aberta")).toBe("1");

    first.unmount();
    renderIt();
    expect(await screen.findByText("Novo visitante cadastrado: Maria Visitante")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Atividade recente/ }));
    expect(screen.queryByText("Novo visitante cadastrado: Maria Visitante")).toBeNull();
    expect(window.localStorage.getItem("aava:membros:atividade-aberta")).toBe("0");
  });
});
