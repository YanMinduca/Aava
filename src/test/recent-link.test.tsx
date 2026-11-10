import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ rpc: vi.fn(), toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    from: () => ({
      select: () => ({
        is: () => ({
          order: async () => ({
            data: [
              {
                id: "m1",
                full_name: "Maria Silva",
                email: "maria@x.com",
                phone: null,
                status: "membro_ativo",
              },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

import { isRecentLink, latestLinkByMember, RECENT_LINK_DAYS } from "@/lib/recent-link";
import { UnlinkedAccounts } from "@/components/members/UnlinkedAccounts";

const now = new Date("2026-11-10T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

describe("cadastro recente", () => {
  it("vale por 7 dias depois do vínculo", () => {
    expect(RECENT_LINK_DAYS).toBe(7);
    expect(isRecentLink(daysAgo(1), now)).toBe(true);
    expect(isRecentLink(daysAgo(7), now)).toBe(true);
    expect(isRecentLink(daysAgo(8), now)).toBe(false);
    expect(isRecentLink(null, now)).toBe(false);
  });
  it("usa o vínculo mais recente de cada cadastro", () => {
    const map = latestLinkByMember([
      { member_id: "a", created_at: daysAgo(5) },
      { member_id: "a", created_at: daysAgo(1) },
      { member_id: null, created_at: daysAgo(1) },
    ]);
    expect(map.get("a")).toBe(daysAgo(1));
    expect(map.size).toBe(1);
  });
});

describe("contas sem cadastro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockResolvedValue({ data: "ok", error: null });
  });
  afterEach(cleanup);
  const accounts = [
    {
      account_id: "u1",
      account_name: "Maria Silva",
      account_email: "maria@x.com",
      member_id: null,
    },
    { account_id: "u2", account_name: "João", account_email: "joao@x.com", member_id: "m9" },
  ];
  const renderIt = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UnlinkedAccounts accounts={accounts} loading={false} />
      </QueryClientProvider>,
    );

  it("lista só as contas sem vínculo", () => {
    renderIt();
    expect(screen.getByText("Maria Silva")).toBeTruthy();
    expect(screen.queryByText("João")).toBeNull();
  });

  it("vincula a conta ao cadastro escolhido", async () => {
    renderIt();
    fireEvent.click(screen.getByRole("button", { name: /Vincular a um cadastro/ }));
    await screen.findByText("Sugestão");
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("link_member_account", { _member: "m1", _user: "u1" }),
    );
  });
});
