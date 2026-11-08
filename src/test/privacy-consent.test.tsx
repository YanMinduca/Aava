import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
  navigate: vi.fn(),
  site: {
    name: "Comunidade Teste",
    address: "Rua das Flores, 10",
    city: "Jacareí",
    email: "contato@teste.org",
    phone: "(12) 99999-0000",
    whatsappUrl: "https://wa.me/5512999990000",
  } as {
    name: string;
    address: string;
    city: string;
    email: string;
    phone: string;
    whatsappUrl: string;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => h.navigate,
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));
vi.mock("@/components/auth/ResendConfirmation", () => ({ ResendConfirmation: () => null }));
vi.mock("@/lib/resend-limit", () => ({ recordSend: vi.fn() }));
vi.mock("@/components/site/SiteLayout", () => ({
  SiteLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/site/PageError", () => ({ PageError: () => null }));
vi.mock("@/lib/site-query", () => ({
  siteQuery: {},
  siteMeta: () => ({}),
  useSiteContent: () => h.site,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: h.signUp,
      signInWithPassword: vi.fn(),
      updateUser: h.updateUser,
      resetPasswordForEmail: vi.fn(),
    },
  },
}));

import { PRIVACY_VERSION, recordPrivacyConsent, recordSensitiveConsent } from "@/lib/privacy";
import { Route as AuthRoute } from "@/routes/auth";
import { Route as PrivacyRoute } from "@/routes/privacidade";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const AuthPage = (AuthRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;
const PrivacyPage = (PrivacyRoute as unknown as { options: { component: React.ComponentType } })
  .options.component;

beforeEach(() => {
  vi.clearAllMocks();
  h.site.email = "contato@teste.org";
  h.site.phone = "(12) 99999-0000";
  h.site.whatsappUrl = "https://wa.me/5512999990000";
  h.signUp.mockResolvedValue({ data: { session: null }, error: null });
  h.updateUser.mockResolvedValue({ data: {}, error: null });
});
afterEach(cleanup);

function openSignup() {
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: /Criar conta/ }));
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: "Maria Souza" } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "maria@exemplo.com" } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "senha123" } });
}
const submitSignup = () => fireEvent.submit(screen.getByLabelText("E-mail").closest("form")!);

describe("aceite da Política de Privacidade ao criar conta", () => {
  it("sem marcar o aceite, a conta NÃO é criada e a pessoa é avisada", () => {
    openSignup();
    submitSignup();
    expect(h.signUp).not.toHaveBeenCalled();
    expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/Política de Privacidade/));
  });

  it("marcando o aceite, cria a conta e guarda data e versão do aceite", async () => {
    openSignup();
    fireEvent.click(screen.getByRole("checkbox"));
    submitSignup();
    await waitFor(() => expect(h.signUp).toHaveBeenCalledTimes(1));
    const { options } = h.signUp.mock.calls[0]![0];
    expect(options.data.full_name).toBe("Maria Souza");
    expect(options.data.privacy_version).toBe(PRIVACY_VERSION);
    expect(Number.isNaN(Date.parse(options.data.privacy_accepted_at))).toBe(false);
  });

  it("o aceite tem link para a política em nova aba", () => {
    openSignup();
    const link = screen.getByRole("link", { name: "Política de Privacidade" });
    expect(link.getAttribute("href")).toBe("/privacidade");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("entrar numa conta existente não exige aceite", () => {
    render(<AuthPage />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("registro do consentimento", () => {
  it("grava o aceite geral e o aceite de dado sensível nos dados da conta", async () => {
    await recordPrivacyConsent();
    expect(h.updateUser).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        privacy_version: PRIVACY_VERSION,
        privacy_accepted_at: expect.any(String),
      }),
    });
    await recordSensitiveConsent();
    expect(h.updateUser).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        sensitive_consent_version: PRIVACY_VERSION,
        sensitive_consent_at: expect.any(String),
      }),
    });
  });

  it("se gravar falhar, não derruba a inscrição (nunca lança erro)", async () => {
    h.updateUser.mockRejectedValue(new Error("rede"));
    await expect(recordPrivacyConsent()).resolves.toBeUndefined();
    await expect(recordSensitiveConsent()).resolves.toBeUndefined();
  });
});

describe("página Política de Privacidade", () => {
  it("traz as seções que a LGPD pede e usa o nome e o endereço da igreja cadastrados", () => {
    render(<PrivacyPage />);
    for (const title of [
      "Quem é responsável pelos seus dados",
      "Quais dados coletamos e para quê",
      "Dados sensíveis",
      "Com quem compartilhamos",
      "Por quanto tempo guardamos",
      "Seus direitos",
      "Crianças e adolescentes",
      "Fale com a gente",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getAllByText(/Comunidade Teste/).length).toBeGreaterThan(0);
    // o endereço aparece em "Quem é responsável" e em "Fale com a gente"
    expect(screen.getAllByText(/Rua das Flores, 10, Jacareí/)).toHaveLength(2);
  });

  it("descreve o que o sistema realmente coleta, incluindo CPF e religião de visitantes", () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/CPF, RG, data de nascimento/)).toBeTruthy();
    expect(screen.getByText(/instituição que frequentam e a\s+religião/)).toBeTruthy();
    expect(screen.getByText(/apagado automaticamente depois de 12 meses/)).toBeTruthy();
  });

  it("mostra os canais de contato que a igreja preencheu", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("link", { name: "contato@teste.org" }).getAttribute("href")).toBe(
      "mailto:contato@teste.org",
    );
    expect(screen.getByText("(12) 99999-0000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeTruthy();
  });

  it("não mostra canais em branco nem links inseguros; sempre oferece a página Contato", () => {
    h.site.email = "";
    h.site.phone = "";
    h.site.whatsappUrl = "javascript:alert(1)";
    render(<PrivacyPage />);
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
    expect(screen.queryByText(/mailto:/)).toBeNull();
    expect(screen.getByRole("link", { name: "Contato" }).getAttribute("href")).toBe("/contato");
  });
});
