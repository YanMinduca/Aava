import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  purge: vi.fn(),
  signed: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: {
      from: () => ({
        createSignedUrls: (p: string[]) => h.signed(p),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://pub/${p}` } }),
      }),
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/storage-trash", () => ({ purgeStorageTrash: h.purge }));

import { MemberDuplicateAlert } from "@/components/members/MemberDuplicateAlert";
import { CpfSignupNotice } from "@/components/members/CpfSignupNotice";
import { StorageCleanupCard } from "@/components/admin/UserAdmin";
import { memberSaveError } from "@/lib/departments";

const wrap = (ui: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("aviso de membro duplicado (adm)", () => {
  const row = (o: object) => ({ id: "m1", full_name: "José da Silva", registration_number: "0007", status: "membro", approval_status: "aprovado", has_account: false, match_name: false, match_cpf: false, match_rg: false, ...o });

  it("não consulta o banco enquanto não há nome completo, CPF completo ou RG", async () => {
    render(wrap(<MemberDuplicateAlert name="Jose" cpf="123" rg="12" />));
    await new Promise((r) => setTimeout(r, 900));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("avisa quando o CPF já existe e mostra quem é", async () => {
    h.rpc.mockResolvedValue({ data: [row({ match_cpf: true, match_name: true })], error: null });
    render(wrap(<MemberDuplicateAlert name="José da Silva" cpf="529.982.247-25" rg="" excludeId="meu-id" />));
    await screen.findByText(/CPF já está cadastrado/, undefined, { timeout: 3000 });
    expect(screen.getByText("José da Silva")).toBeTruthy();
    expect(screen.getByText("mesmo CPF")).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith("find_member_duplicates", { _name: "José da Silva", _cpf: "529.982.247-25", _rg: "", _exclude: "meu-id" });
  });

  it("para nome ou RG repetidos só avisa para conferir (não diz que bloqueia)", async () => {
    h.rpc.mockResolvedValue({ data: [row({ match_name: true })], error: null });
    render(wrap(<MemberDuplicateAlert name="José da Silva" />));
    await screen.findByText(/cadastro parecido/, undefined, { timeout: 3000 });
    expect(screen.queryByText(/Não é possível salvar/)).toBeNull();
  });
});

describe("CPF de quem está criando conta", () => {
  it("bloqueia o envio e oferece vincular ao cadastro existente", async () => {
    h.rpc.mockImplementation(async (fn: string) =>
      fn === "check_cpf_for_signup" ? { data: [{ id: "m1", masked_name: "José S.", state: "claimable" }], error: null } : { data: "ok", error: null },
    );
    const onBlock = vi.fn();
    const onClaimed = vi.fn();
    render(wrap(<CpfSignupNotice cpf="529.982.247-25" canClaim onBlockChange={onBlock} onClaimed={onClaimed} />));
    await screen.findByText(/Já existe um cadastro com este CPF/, undefined, { timeout: 3000 });
    expect(screen.getByText("José S.")).toBeTruthy();
    await waitFor(() => expect(onBlock).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByText(/vincular minha conta/));
    await waitFor(() => expect(onClaimed).toHaveBeenCalled());
    expect(h.rpc).toHaveBeenCalledWith("claim_member", { _member: "m1", _cpf: "529.982.247-25" });
  });

  it("CPF de cadastro já ligado a outra conta: bloqueia e não oferece vincular", async () => {
    h.rpc.mockResolvedValue({ data: [{ id: "m2", masked_name: "Ana P.", state: "in_use" }], error: null });
    const onBlock = vi.fn();
    render(wrap(<CpfSignupNotice cpf="529.982.247-25" canClaim onBlockChange={onBlock} onClaimed={() => {}} />));
    await screen.findByText(/já está vinculado a outra conta/, undefined, { timeout: 3000 });
    expect(screen.queryByText(/vincular minha conta/)).toBeNull();
    await waitFor(() => expect(onBlock).toHaveBeenLastCalledWith(true));
  });

  it("CPF livre não bloqueia nada", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    const onBlock = vi.fn();
    render(wrap(<CpfSignupNotice cpf="529.982.247-25" canClaim onBlockChange={onBlock} onClaimed={() => {}} />));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("check_cpf_for_signup", { _cpf: "52998224725" }), { timeout: 3000 });
    expect(onBlock).not.toHaveBeenCalledWith(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("traduz o erro do índice de CPF único", () => {
    expect(memberSaveError({ message: 'duplicate key value violates unique constraint "members_cpf_digits_key"' })).toMatch(/mesmo? CPF|com este CPF/);
  });
});

describe("arquivos sem uso: escolher quais apagar", () => {
  const orphans = [
    { bucket: "member-photos", path: "admin/a.jpg", size: 120000, created_at: "2026-10-01T10:00:00Z" },
    { bucket: "member-photos", path: "admin/b.jpg", size: 80000, created_at: "2026-10-02T10:00:00Z" },
    { bucket: "receipts", path: "x/recibo.pdf", size: 5000, created_at: "2026-10-03T10:00:00Z" },
  ];
  const setup = () => {
    h.rpc.mockImplementation(async (fn: string) => (fn === "storage_orphans_preview" ? { data: orphans, error: null } : { data: 1, error: null }));
    h.signed.mockResolvedValue({ data: [{ path: "admin/a.jpg", signedUrl: "https://s/a" }, { path: "admin/b.jpg", signedUrl: "https://s/b" }] });
    h.purge.mockResolvedValue(1);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(wrap(<StorageCleanupCard />));
    fireEvent.click(screen.getByText("Verificar agora"));
  };

  it("lista os arquivos, começa sem nada marcado e só apaga o que foi marcado", async () => {
    setup();
    await screen.findByText(/0 de 3 marcados/);
    expect((screen.getByRole("button", { name: /Apagar marcados/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("Apagar admin/b.jpg"));
    await screen.findByText(/1 de 3 marcados/);
    fireEvent.click(screen.getByRole("button", { name: /Apagar 1 marcado/ }));

    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith("storage_enqueue_orphans_selected", { _items: [{ bucket: "member-photos", path: "admin/b.jpg" }] }),
    );
    await waitFor(() => expect(h.purge).toHaveBeenCalled());
    await screen.findByText(/0 de 2 marcados/);
    expect(screen.queryByLabelText("Apagar admin/b.jpg")).toBeNull();
    expect(screen.getByLabelText("Apagar admin/a.jpg")).toBeTruthy();
  });

  it("filtra por tipo de arquivo e 'Marcar os exibidos' marca só o filtro atual", async () => {
    setup();
    await screen.findByText(/0 de 3 marcados/);
    fireEvent.click(screen.getByText(/Recibos do financeiro \(1\)/));
    fireEvent.click(screen.getByText(/Marcar os exibidos \(1\)/));
    await screen.findByText(/1 de 3 marcados/);
    fireEvent.click(screen.getByText("Desmarcar tudo"));
    await screen.findByText(/0 de 3 marcados/);
  });
});
