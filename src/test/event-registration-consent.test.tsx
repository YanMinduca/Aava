import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  rpc: vi.fn(),
  updateUser: vi.fn(),
  profile: null as null | Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("@/hooks/use-access", () => ({
  useAccess: () => ({ data: { uid: "u1" }, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    auth: {
      updateUser: h.updateUser,
      getUser: () => Promise.resolve({ data: { user: { user_metadata: {} } } }),
    },
    from: (table: string) => {
      if (table === "members") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve({ data: h.profile }),
        };
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        neq: () => Promise.resolve({ data: [] }),
      };
      return chain;
    },
  },
}));

import { PRIVACY_VERSION } from "@/lib/privacy";
import { RELIGIONS } from "@/lib/event-data";
import { EventRegistration } from "@/components/events/EventRegistration";
import type { PublicEventDetail } from "@/lib/events";

// O jsdom não tem estes recursos dos navegadores; o checkbox e o select do Radix precisam deles.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

const VALID_CPF = "529.982.247-25";

const detail: PublicEventDetail = {
  event: {
    id: "ev1",
    slug: "retiro",
    title: "Retiro",
    description: null,
    location: null,
    starts_at: "2099-01-01T10:00:00Z",
    ends_at: null,
    registration_opens_at: null,
    registration_closes_at: null,
    audience: "public",
    payment_enabled: false,
    accepts_card: false,
    allow_installments: false,
    max_installments: 1,
    limit_per_person: false,
    max_per_person: null,
    require_image_consent: false,
  },
  lots: [
    {
      id: "lot1",
      name: "Geral",
      price: 0,
      capacity: null,
      spots_left: null,
      public_access: true,
      opens_at: null,
      closes_at: null,
    },
  ],
};

function renderIt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventRegistration detail={detail} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = null;
  h.rpc.mockResolvedValue({ data: null, error: null });
  h.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

describe("inscrição em evento: dados do visitante", () => {
  async function fillVisitor() {
    const form = (await screen.findByRole("button", { name: "Continuar" })).closest("form")!;
    const inputs = form.querySelectorAll("input:not([type=checkbox])");
    const [name, cpf, phone, birth] = Array.from(inputs) as HTMLInputElement[];
    fireEvent.change(name!, { target: { value: "Maria Souza" } });
    fireEvent.change(cpf!, { target: { value: VALID_CPF } });
    fireEvent.change(phone!, { target: { value: "12999990000" } });
    fireEvent.change(birth!, { target: { value: "1990-05-10" } });
    return form;
  }

  it("sem aceitar a Política de Privacidade, os dados NÃO são enviados", async () => {
    renderIt();
    const form = await fillVisitor();
    fireEvent.submit(form);
    expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/Política de Privacidade/));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("aceitando, salva os dados e anota o consentimento na conta", async () => {
    renderIt();
    const form = await fillVisitor();
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.submit(form);
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        "ensure_visitor_profile",
        expect.objectContaining({ _cpf: VALID_CPF }),
      ),
    );
    await waitFor(() =>
      expect(h.updateUser).toHaveBeenCalledWith({
        data: expect.objectContaining({ privacy_version: PRIVACY_VERSION }),
      }),
    );
  });
});

describe("inscrição em evento: religião é dado sensível", () => {
  const visitorProfile = {
    id: "m1",
    full_name: "Maria",
    cpf: "52998224725",
    phone: "1",
    birth_date: "1990-05-10",
    status: "visitante",
    approval_status: "aprovado",
  };

  async function fillRegistration() {
    const institution = await screen.findByPlaceholderText(/Ex\.: igreja/);
    fireEvent.change(institution, { target: { value: "Escola Municipal" } });
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const option = await screen.findByRole("option", { name: RELIGIONS[0]!.label });
    fireEvent.keyDown(option, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("option")).toBeNull());
    return screen.getByRole("button", { name: "Inscrever-se" }) as HTMLButtonElement;
  }

  it("visitante: o botão só libera depois de autorizar o uso da religião", async () => {
    h.profile = visitorProfile;
    renderIt();
    const submit = await fillRegistration();
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso da minha religião/ }));
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it("ao se inscrever, anota o consentimento específico de dado sensível", async () => {
    h.profile = visitorProfile;
    renderIt();
    const submit = await fillRegistration();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo o uso da minha religião/ }));
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(h.updateUser).toHaveBeenCalledWith({
        data: expect.objectContaining({ sensitive_consent_version: PRIVACY_VERSION }),
      }),
    );
    expect(h.rpc).toHaveBeenCalledWith(
      "register_for_event",
      expect.objectContaining({ _religion: RELIGIONS[0]!.value }),
    );
  });

  it("membro aprovado não vê a pergunta de religião nem o consentimento sensível", async () => {
    h.profile = { ...visitorProfile, status: "ativo" };
    renderIt();
    await screen.findByRole("button", { name: "Inscrever-se" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/Autorizo o uso da minha religião/)).toBeNull();
  });
});
