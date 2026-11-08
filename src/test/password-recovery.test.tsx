import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  authListener: null as null | ((event: string, session: unknown) => void),
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
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: h.resetPasswordForEmail,
      updateUser: h.updateUser,
      signOut: h.signOut,
      getSession: h.getSession,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        h.authListener = cb;
        return { data: { subscription: { unsubscribe: h.unsubscribe } } };
      },
    },
  },
}));

import { friendlyAuthError } from "@/lib/auth-errors";
import { ForgotPasswordCard } from "@/components/auth/ForgotPasswordCard";
import { Route as ResetRoute } from "@/routes/redefinir-senha";
import { Route as AuthRoute } from "@/routes/auth";

const ResetPage = (ResetRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;
const AuthPage = (AuthRoute as unknown as { options: { component: React.ComponentType } }).options
  .component;

// O jsdom não tem ResizeObserver (os navegadores têm); o checkbox do Radix na tela de criar conta precisa dele.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  h.authListener = null;
  h.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  h.updateUser.mockResolvedValue({ data: {}, error: null });
  h.signOut.mockResolvedValue({ error: null });
  h.getSession.mockResolvedValue({ data: { session: null } });
  window.location.hash = "";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("tradução dos erros de autenticação", () => {
  it("traduz os erros mais comuns do Supabase", () => {
    expect(
      friendlyAuthError(
        new Error("For security purposes, you can only request this after 45 seconds."),
      ),
    ).toMatch(/Aguarde um minuto/);
    expect(
      friendlyAuthError(new Error("New password should be different from the old password.")),
    ).toMatch(/diferente da senha atual/);
    expect(friendlyAuthError(new Error("Password should be at least 6 characters."))).toMatch(
      /muito curta/,
    );
    expect(friendlyAuthError(new Error("Auth session missing!"))).toMatch(/expirou/);
    expect(friendlyAuthError(new Error("Failed to fetch"))).toMatch(/Sem conexão/);
  });

  it("nunca devolve texto técnico em inglês para erros desconhecidos", () => {
    const msg = friendlyAuthError(new Error("unexpected_failure: something exploded"));
    expect(msg).toBe("Não foi possível concluir. Tente novamente em instantes.");
    expect(friendlyAuthError(undefined)).toBe(
      "Não foi possível concluir. Tente novamente em instantes.",
    );
  });
});

describe("tela Recuperar senha", () => {
  it("envia o link com o endereço correto e mostra aviso neutro (sem revelar se o e-mail existe)", async () => {
    render(
      <ForgotPasswordCard email="ana@exemplo.com" onEmailChange={() => {}} onBack={() => {}} />,
    );
    fireEvent.submit(screen.getByLabelText("E-mail").closest("form")!);
    await waitFor(() => expect(h.resetPasswordForEmail).toHaveBeenCalledTimes(1));
    expect(h.resetPasswordForEmail).toHaveBeenCalledWith("ana@exemplo.com", {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    expect(await screen.findByText(/Se existir uma conta com o e-mail/)).toBeTruthy();
    expect(screen.getByText(/spam/)).toBeTruthy();
  });

  it("depois de enviar, o reenvio fica bloqueado por 60 segundos", async () => {
    render(
      <ForgotPasswordCard email="ana@exemplo.com" onEmailChange={() => {}} onBack={() => {}} />,
    );
    fireEvent.submit(screen.getByLabelText("E-mail").closest("form")!);
    const resend = await screen.findByRole("button", { name: /Enviar de novo em 60s/ });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(resend);
    expect(h.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("mostra erro em português quando o envio falha", async () => {
    h.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new Error("For security purposes, you can only request this after 30 seconds"),
    });
    render(
      <ForgotPasswordCard email="ana@exemplo.com" onEmailChange={() => {}} onBack={() => {}} />,
    );
    fireEvent.submit(screen.getByLabelText("E-mail").closest("form")!);
    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/Aguarde um minuto/)),
    );
    expect(screen.queryByText(/Se existir uma conta/)).toBeNull();
  });

  it("o botão Voltar chama onBack", () => {
    const onBack = vi.fn();
    render(<ForgotPasswordCard email="" onEmailChange={() => {}} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("tela de login", () => {
  it("o link Esqueci minha senha abre a recuperação mantendo o e-mail já digitado", () => {
    render(<AuthPage />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "joao@exemplo.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(screen.getByRole("heading", { name: "Recuperar senha" })).toBeTruthy();
    expect((screen.getByLabelText("E-mail") as HTMLInputElement).value).toBe("joao@exemplo.com");
    fireEvent.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeTruthy();
  });

  it("não mostra Esqueci minha senha na tela de criar conta", () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole("button", { name: /Criar conta/ }));
    expect(screen.queryByRole("button", { name: "Esqueci minha senha" })).toBeNull();
  });
});

describe("página Criar nova senha", () => {
  const withRecoverySession = () =>
    h.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  const fill = (a: string, b: string) => {
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: a } });
    fireEvent.change(screen.getByLabelText("Repita a nova senha"), { target: { value: b } });
    fireEvent.submit(screen.getByLabelText("Nova senha").closest("form")!);
  };

  it("com o link válido mostra o formulário; troca a senha, encerra outros aparelhos e vai ao painel", async () => {
    withRecoverySession();
    render(<ResetPage />);
    await screen.findByLabelText("Nova senha");
    fill("senhaNova123", "senhaNova123");
    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith({ password: "senhaNova123" }));
    expect(h.signOut).toHaveBeenCalledWith({ scope: "others" });
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ to: "/painel" }));
    expect(h.toastSuccess).toHaveBeenCalled();
  });

  it("reconhece o evento PASSWORD_RECOVERY mesmo sem sessão carregada ainda", async () => {
    render(<ResetPage />);
    expect(screen.getByText(/Verificando seu link/)).toBeTruthy();
    act(() => h.authListener?.("PASSWORD_RECOVERY", { user: { id: "u1" } }));
    expect(await screen.findByLabelText("Nova senha")).toBeTruthy();
  });

  it("bloqueia senhas diferentes e não chama o servidor", async () => {
    withRecoverySession();
    render(<ResetPage />);
    await screen.findByLabelText("Nova senha");
    fill("senhaNova123", "outraCoisa456");
    expect(await screen.findByText(/não são iguais/)).toBeTruthy();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("bloqueia senha curta", async () => {
    withRecoverySession();
    render(<ResetPage />);
    await screen.findByLabelText("Nova senha");
    fill("123", "123");
    expect(await screen.findByText(/pelo menos 6 caracteres/)).toBeTruthy();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("mostra o erro em português se o servidor recusar (ex.: mesma senha de antes)", async () => {
    withRecoverySession();
    h.updateUser.mockResolvedValue({
      data: null,
      error: new Error("New password should be different from the old password."),
    });
    render(<ResetPage />);
    await screen.findByLabelText("Nova senha");
    fill("senhaNova123", "senhaNova123");
    expect(await screen.findByText(/diferente da senha atual/)).toBeTruthy();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("o botão do olho alterna entre mostrar e esconder a senha", async () => {
    withRecoverySession();
    render(<ResetPage />);
    const input = (await screen.findByLabelText("Nova senha")) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Esconder senha" }));
    expect(input.type).toBe("password");
  });

  it("link vencido (erro no endereço) mostra como pedir outro", () => {
    window.location.hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    render(<ResetPage />);
    expect(screen.getByText(/expirou, já foi usado/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Pedir um novo link" }).getAttribute("href")).toBe(
      "/auth",
    );
    expect(screen.queryByLabelText("Nova senha")).toBeNull();
  });

  it("sem sessão nenhuma depois de alguns segundos, trata como link inválido", async () => {
    vi.useFakeTimers();
    render(<ResetPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(screen.getByText(/expirou, já foi usado/)).toBeTruthy();
  });

  it("limpa o ouvinte de autenticação ao sair da página", async () => {
    withRecoverySession();
    const { unmount } = render(<ResetPage />);
    await screen.findByLabelText("Nova senha");
    unmount();
    expect(h.unsubscribe).toHaveBeenCalled();
  });
});
