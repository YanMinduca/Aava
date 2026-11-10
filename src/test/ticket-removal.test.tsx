import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ rpc: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc } }));

import { TicketRemoval } from "@/components/events/TicketRemoval";
import type { Tables } from "@/integrations/supabase/types";

const ticket = (over: Partial<Tables<"event_tickets">>): Tables<"event_tickets"> => ({
  id: "t1",
  registration_id: "r1",
  event_id: "e1",
  seq: 1,
  code: "c",
  short_code: "K7M29QXA",
  holder_name: "Ana Souza",
  status: "valid",
  checked_in_at: null,
  checked_in_by: null,
  created_at: "2026-11-01T10:00:00Z",
  removal_id: null,
  ...over,
});
const reg = { id: "r1", status: "confirmed", quantity: 3, unit_price: 50 };

function renderIt(props: Partial<React.ComponentProps<typeof TicketRemoval>> = {}) {
  const onChange = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TicketRemoval
        reg={reg}
        tickets={[
          ticket({ id: "t1", seq: 1 }),
          ticket({ id: "t2", seq: 2, holder_name: "Ana Souza (2)" }),
          ticket({ id: "t3", seq: 3, holder_name: "Ana Souza (3)", status: "checked_in" }),
        ]}
        removals={[]}
        paidSum={150}
        onChange={onChange}
        {...props}
      />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.rpc.mockResolvedValue({ data: { refund_due: 50 }, error: null });
});
afterEach(cleanup);

describe("remoção de ingressos no painel", () => {
  it("ingresso com presença confirmada não pode ser marcado", () => {
    renderIt();
    expect(
      (screen.getByLabelText("Remover o ingresso de Ana Souza (3)") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("sem observação não confirma; com observação chama a função com os ingressos escolhidos", async () => {
    const onChange = renderIt();
    fireEvent.click(screen.getByLabelText("Remover o ingresso de Ana Souza (2)"));
    fireEvent.click(screen.getByRole("button", { name: /Remover selecionados \(1\)/ }));
    const confirm = screen.getByRole("button", { name: "Confirmar remoção" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(screen.getByTestId("removal-summary").textContent).toMatch(/2 ingressos/);
    expect(screen.getByTestId("removal-summary").textContent).toMatch(/a devolver/);
    fireEvent.change(screen.getByLabelText(/Observação/), {
      target: { value: "  Pessoa   desistiu " },
    });
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("remove_event_tickets", {
        _reg: "r1",
        _reason: "Pessoa desistiu",
        _ticket_ids: ["t2"],
      }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("inscrição ainda sem ingressos: remove por quantidade", async () => {
    renderIt({ reg: { ...reg, status: "pending", quantity: 2 }, tickets: [], paidSum: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Remover ingressos" }));
    fireEvent.change(screen.getByLabelText(/Quantos ingressos/), { target: { value: "2" } });
    expect(screen.getByTestId("removal-summary").textContent).toMatch(/cancelada/);
    fireEvent.change(screen.getByLabelText(/Observação/), { target: { value: "Duplicada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar remoção" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("remove_event_tickets", {
        _reg: "r1",
        _reason: "Duplicada",
        _quantity: 2,
      }),
    );
  });

  it("mostra o motivo no ingresso removido e não oferece remover de novo", () => {
    renderIt({
      tickets: [ticket({ id: "t1", status: "cancelled", removal_id: "x1" })],
      removals: [
        {
          id: "x1",
          event_id: "e1",
          registration_id: "r1",
          tickets_removed: 1,
          holder_names: [],
          reason: "Pagamento não identificado",
          registration_cancelled: false,
          refund_due: 0,
          removed_by: null,
          removed_at: "2026-11-02T10:00:00Z",
        },
      ],
    });
    expect(screen.getAllByText(/Pagamento não identificado/).length).toBeGreaterThan(0);
    expect(
      (screen.getByLabelText("Remover o ingresso de Ana Souza") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
