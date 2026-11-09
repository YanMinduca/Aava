import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  rpc: vi.fn(),
  profile: null as null | Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn() } }));
vi.mock("@/hooks/use-access", () => ({
  useAccess: () => ({ data: { uid: "u1" }, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: h.rpc,
    auth: { getUser: () => Promise.resolve({ data: { user: { user_metadata: {} } } }) },
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

import { ChildRegistration } from "@/components/events/ChildRegistration";
import { EventRegistration } from "@/components/events/EventRegistration";
import {
  DEFAULT_CHILD_NOTICE,
  parseChildAge,
  lotBlockReason,
  type PublicEventDetail,
} from "@/lib/events";

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
const member = {
  id: "m1",
  full_name: "Ana Responsável",
  cpf: "11144477735",
  phone: "1",
  birth_date: "1985-01-01",
  status: "membro",
  approval_status: "aprovado",
};

function makeDetail(over: Partial<PublicEventDetail["event"]> = {}): PublicEventDetail {
  return {
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
      allow_child_registration: true,
      child_registration_notice: null,
      ...over,
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
}

function renderChild(detail = makeDetail()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ChildRegistration detail={detail} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.profile = member;
  h.rpc.mockResolvedValue({ data: "reg1", error: null });
});
afterEach(cleanup);

async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: /Inscrever meu filho/ }));
  return {
    name: (await screen.findByLabelText(/Nome completo da criança/)) as HTMLInputElement,
    cpf: screen.getByLabelText(/CPF da criança/) as HTMLInputElement,
    age: screen.getByLabelText(/Idade da criança/) as HTMLInputElement,
  };
}

describe("inscrever meu filho", () => {
  it("não aparece quando a opção está desativada no evento", async () => {
    renderChild(makeDetail({ allow_child_registration: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Inscrever meu filho/)).toBeNull();
  });

  it("mostra o aviso padrão e, quando editado, o aviso da igreja", async () => {
    const { unmount } = renderChild();
    expect(await screen.findByText(DEFAULT_CHILD_NOTICE)).toBeTruthy();
    unmount();
    renderChild(
      makeDetail({ child_registration_notice: "Só inscreva se for sentar em cadeira própria." }),
    );
    expect(await screen.findByText("Só inscreva se for sentar em cadeira própria.")).toBeTruthy();
  });

  it("pede nome, CPF e idade e envia ao banco", async () => {
    renderChild();
    const f = await openForm();
    fireEvent.change(f.name, { target: { value: "Maria Souza" } });
    fireEvent.change(f.cpf, { target: { value: VALID_CPF } });
    fireEvent.change(f.age, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Inscrever criança" }));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        "register_child_for_event",
        expect.objectContaining({
          _event: "ev1",
          _lot: "lot1",
          _child_name: "Maria Souza",
          _child_cpf: VALID_CPF,
          _child_age: 7,
        }),
      ),
    );
  });

  it("a opção continua aparecendo depois de inscrever (outro filho)", async () => {
    renderChild();
    const f = await openForm();
    fireEvent.change(f.name, { target: { value: "Maria Souza" } });
    fireEvent.change(f.cpf, { target: { value: VALID_CPF } });
    fireEvent.change(f.age, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Inscrever criança" }));
    expect(await screen.findByText(/Inscrição de Maria Souza realizada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Inscrever outro filho/ })).toBeTruthy();
  });

  it("limita a idade a 13 anos: com 14 não envia", async () => {
    renderChild();
    const f = await openForm();
    fireEvent.change(f.name, { target: { value: "Pedro Souza" } });
    fireEvent.change(f.cpf, { target: { value: VALID_CPF } });
    fireEvent.change(f.age, { target: { value: "14" } });
    // O navegador já barra pelo atributo max=13 do campo…
    expect(f.age.validity.rangeOverflow).toBe(true);
    // …e, se essa trava fosse contornada, a validação do código também recusa.
    fireEvent.submit(f.age.closest("form")!);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/0 a 13 anos/)),
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("recusa CPF inválido e nome de uma palavra só", async () => {
    renderChild();
    const f = await openForm();
    fireEvent.change(f.name, { target: { value: "Pedro" } });
    fireEvent.change(f.cpf, { target: { value: VALID_CPF } });
    fireEvent.change(f.age, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Inscrever criança" }));
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/nome completo da criança/)),
    );
    fireEvent.change(f.name, { target: { value: "Pedro Souza" } });
    fireEvent.change(f.cpf, { target: { value: "111.111.111-11" } });
    fireEvent.click(screen.getByRole("button", { name: "Inscrever criança" }));
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/CPF da criança inválido/)),
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("quando o evento exige uso de imagem, o botão fica bloqueado até o responsável aceitar", async () => {
    renderChild(makeDetail({ require_image_consent: true }));
    const f = await openForm();
    fireEvent.change(f.name, { target: { value: "Maria Souza" } });
    fireEvent.change(f.cpf, { target: { value: VALID_CPF } });
    fireEvent.change(f.age, { target: { value: "7" } });
    const submit = screen.getByRole("button", { name: "Inscrever criança" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith(
        "register_child_for_event",
        expect.objectContaining({ _image_consent: true }),
      ),
    );
  });

  it("aparece junto da inscrição do adulto na página do evento", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <EventRegistration detail={makeDetail()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Inscrever-se" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Inscrever meu filho/ })).toBeTruthy();
  });
});

describe("regras auxiliares", () => {
  it("parseChildAge aceita só 0 a 13", () => {
    expect(parseChildAge("0")).toBe(0);
    expect(parseChildAge("13")).toBe(13);
    expect(parseChildAge("14")).toBeNull();
    expect(parseChildAge("")).toBeNull();
    expect(parseChildAge("-1")).toBeNull();
    expect(parseChildAge("7,5")).toBeNull();
  });

  it("lotBlockReason respeita público, período e vagas", () => {
    const base = {
      id: "l",
      name: "L",
      price: 0,
      capacity: null,
      spots_left: null,
      public_access: true,
      opens_at: null,
      closes_at: null,
    };
    expect(lotBlockReason({ audience: "public" }, base, false)).toBeNull();
    expect(lotBlockReason({ audience: "members" }, { ...base, public_access: false }, false)).toBe(
      "Só para membros",
    );
    expect(
      lotBlockReason({ audience: "members" }, { ...base, public_access: false }, true),
    ).toBeNull();
    expect(lotBlockReason({ audience: "public" }, { ...base, spots_left: 0 }, true)).toBe(
      "Esgotado",
    );
    expect(
      lotBlockReason({ audience: "public" }, { ...base, closes_at: "2000-01-01T00:00:00Z" }, true),
    ).toBe("Fora do período");
  });
});
