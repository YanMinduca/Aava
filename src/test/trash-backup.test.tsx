import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  download: vi.fn(),
  access: { isFullAccess: true, isLoading: false },
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  purgeFiles: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-access", () => ({ useAccess: () => h.access }));
vi.mock("@/lib/storage-trash", () => ({ purgeStorageTrash: h.purgeFiles }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc, storage: { from: () => ({ download: h.download }) } },
}));

import { backupFilename, createBackup, daysSince } from "@/lib/backup";
import { daysLeft, tableLabel, trashError } from "@/lib/trash";
import { TrashPage } from "@/routes/_authenticated/painel.lixeira";

const readBlob = (blob: Blob) =>
  new Promise<Uint8Array>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.readAsArrayBuffer(blob);
  });

describe("lixeira: utilidades", () => {
  it("conta os dias que faltam e nunca passa de zero", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(daysLeft("2026-11-20T12:00:00Z", now)).toBe(10);
    expect(daysLeft("2026-11-01T12:00:00Z", now)).toBe(0);
  });
  it("traduz tabelas e erros", () => {
    expect(tableLabel("members")).toBe("Membro / visitante");
    expect(tableLabel("alguma_tabela_nova")).toBe("alguma tabela nova");
    expect(trashError(new Error("trash_conflict"))).toMatch(/já existe outro registro/);
    expect(trashError({ message: "Acesso negado" })).toMatch(/CEO/);
    expect(trashError(new Error("???"))).toMatch(/Tente de novo/);
  });
});

describe("backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rpc.mockImplementation(async (fn: string, args?: { _table?: string; _offset?: number }) => {
      if (fn === "backup_tables")
        return {
          data: [
            { table_name: "members", row_count: 2 },
            { table_name: "trash", row_count: 0 },
          ],
          error: null,
        };
      if (fn === "backup_table_page")
        return {
          data:
            args?._table === "members"
              ? [
                  { id: "1", full_name: "Ana" },
                  { id: "2", full_name: "Bia" },
                ]
              : [],
          error: null,
        };
      if (fn === "backup_storage_objects")
        return {
          data: [
            { bucket: "member-photos", name: "a.jpg", size: 3 },
            { bucket: "receipts", name: "x.pdf", size: 3 },
          ],
          error: null,
        };
      return { data: null, error: null };
    });
    h.download.mockImplementation(async (name: string) =>
      name === "a.jpg"
        ? { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null }
        : { data: null, error: new Error("403") },
    );
  });

  it("monta o ZIP com tabelas, arquivos e LEIAME, e registra o backup", async () => {
    const { unzipSync, strFromU8 } = await import("fflate");
    const result = await createBackup({ includeFiles: true });
    const zip = unzipSync(await readBlob(result.blob));
    expect(JSON.parse(strFromU8(zip["dados/members.json"]!))).toHaveLength(2);
    expect(Object.keys(zip)).toContain("dados/trash.json");
    expect(Array.from(zip["arquivos/member-photos/a.jpg"]!)).toEqual([1, 2, 3]);
    expect(strFromU8(zip["LEIAME.txt"]!)).toMatch(/receipts\/x\.pdf/);
    expect(result).toMatchObject({ tables: 2, rows: 2, files: 1, failedFiles: ["receipts/x.pdf"] });
    expect(h.rpc).toHaveBeenCalledWith(
      "backup_record",
      expect.objectContaining({ _tables: 2, _rows: 2, _files: 1, _source: "painel" }),
    );
  });

  it("sem arquivos não baixa nada do armazenamento", async () => {
    const result = await createBackup({ includeFiles: false });
    expect(h.download).not.toHaveBeenCalled();
    expect(result.files).toBe(0);
  });

  it("nome do arquivo e dias desde o último backup", () => {
    expect(backupFilename(new Date(2026, 10, 9, 8, 5))).toBe("aava-backup-2026-11-09-0805.zip");
    expect(daysSince(null)).toBeNull();
    expect(daysSince("2026-11-01T12:00:00Z", new Date("2026-11-10T12:00:00Z"))).toBe(9);
  });
});

describe("página da lixeira", () => {
  const item = {
    id: 7,
    table_name: "events",
    label: "Culto de Páscoa",
    deleted_at: "2026-11-09T10:00:00Z",
    expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
    deleted_by_name: "Yan",
    items: 8,
    total: 1,
  };
  const renderIt = () =>
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <TrashPage />
      </QueryClientProvider>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    h.access.isFullAccess = true;
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === "trash_stats")
        return {
          data: { items: 8, groups: 1, bytes: 4096, by_table: [{ table: "events", groups: 1 }] },
          error: null,
        };
      if (fn === "trash_list") return { data: [item], error: null };
      if (fn === "trash_restore") return { data: { restored: 8 }, error: null };
      return { data: 1, error: null };
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(cleanup);

  it("lista o item com prazo e itens relacionados e restaura", async () => {
    renderIt();
    await screen.findByText("Culto de Páscoa");
    expect(screen.getByText(/\+ 7 itens relacionados/)).toBeTruthy();
    expect(screen.getByText(/some de vez em 20 dias/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Restaurar/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("trash_restore", { _id: 7 }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Restaurado (8 itens)"));
  });

  it("excluir de vez pede confirmação e limpa os arquivos", async () => {
    renderIt();
    await screen.findByText("Culto de Páscoa");
    fireEvent.click(screen.getByRole("button", { name: /Excluir de vez/ }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith("trash_purge", { _ids: [7] }));
    await waitFor(() => expect(h.purgeFiles).toHaveBeenCalled());
  });

  it("quem não é CEO/Pastor Presidente não vê a lixeira", () => {
    h.access.isFullAccess = false;
    renderIt();
    expect(screen.getByText("Acesso restrito")).toBeTruthy();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});
