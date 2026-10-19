import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => h.rpc(...a),
    storage: { from: (b: string) => ({ remove: (p: string[]) => h.remove(b, p), list: (d: string, o: unknown) => h.list(b, d, o) }) },
  },
}));
import { purgeStorageTrash } from "@/lib/storage-trash";

beforeEach(() => {
  h.rpc.mockReset();
  h.remove.mockReset();
  h.list.mockReset();
});

describe("lixeira de arquivos", () => {
  it("apaga os arquivos de cada bucket e só então tira da lixeira", async () => {
    h.rpc.mockImplementation(async (fn: string, args?: { _ids?: number[] }) => {
      if (fn === "storage_trash_next") return h.rpc.mock.calls.filter((c) => c[0] === "storage_trash_next").length === 1
        ? { data: [{ id: 1, bucket: "event-proofs", path: "u1/pag.jpg" }, { id: 2, bucket: "member-photos", path: "admin/foto.jpg" }], error: null }
        : { data: [], error: null };
      return { data: args ?? null, error: null };
    });
    h.remove.mockImplementation(async (_b: string, paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }));
    expect(await purgeStorageTrash()).toBe(2);
    expect(h.remove).toHaveBeenCalledWith("event-proofs", ["u1/pag.jpg"]);
    expect(h.remove).toHaveBeenCalledWith("member-photos", ["admin/foto.jpg"]);
    expect(h.rpc).toHaveBeenCalledWith("storage_trash_done", { _ids: [1, 2] });
  });

  it("não tira da lixeira um arquivo que continua existindo (apagar foi barrado), mas tira o que já não existe", async () => {
    let first = true;
    h.rpc.mockImplementation(async (fn: string) => {
      if (fn === "storage_trash_next") {
        const rows = first ? [{ id: 7, bucket: "receipts", path: "2026/ficou.pdf" }, { id: 8, bucket: "receipts", path: "2026/ja-sumiu.pdf" }] : [];
        first = false;
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    });
    h.remove.mockResolvedValue({ data: [], error: null });
    h.list.mockImplementation(async (_b: string, _d: string, o: { search: string }) => ({ data: o.search === "ficou.pdf" ? [{ name: "ficou.pdf" }] : [], error: null }));
    expect(await purgeStorageTrash()).toBe(1);
    expect(h.rpc).toHaveBeenCalledWith("storage_trash_done", { _ids: [8] });
  });

  it("se o armazenamento der erro, nada sai da lixeira (tenta de novo depois)", async () => {
    h.rpc.mockResolvedValueOnce({ data: [{ id: 1, bucket: "receipts", path: "x.pdf" }], error: null });
    h.remove.mockResolvedValue({ data: null, error: { message: "falhou" } });
    expect(await purgeStorageTrash()).toBe(0);
    expect(h.rpc).not.toHaveBeenCalledWith("storage_trash_done", expect.anything());
  });
});
