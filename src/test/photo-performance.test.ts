import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createSignedUrls: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  compress: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: (paths: string[], ttl: number) => h.createSignedUrls(bucket, paths, ttl),
        download: (p: string) => h.download(bucket, p),
        upload: (p: string, b: Blob, o: unknown) => h.upload(bucket, p, b, o),
      }),
    },
  },
}));
vi.mock("@/lib/images", async (orig) => ({ ...(await orig<typeof import("@/lib/images")>()), compressImage: (...a: unknown[]) => h.compress(...a) }));

import { clearPhotoUrlCache, getPhotoUrl, peekPhotoUrl } from "@/lib/photo-urls";
import { optimizeMemberPhotos } from "@/lib/optimize-photos";

const blobOf = (kb: number, type = "image/jpeg") => new Blob([new Uint8Array(kb * 1024)], { type });

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  clearPhotoUrlCache();
});

describe("URLs assinadas das fotos", () => {
  it("junta vários avatares numa única chamada e reaproveita a URL depois", async () => {
    h.createSignedUrls.mockImplementation(async (_b: string, paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?t=1`, error: null })),
    }));
    const urls = await Promise.all([getPhotoUrl("a/1.jpg"), getPhotoUrl("a/2.jpg"), getPhotoUrl("a/3.jpg")]);
    expect(urls).toEqual(["https://x/a/1.jpg?t=1", "https://x/a/2.jpg?t=1", "https://x/a/3.jpg?t=1"]);
    expect(h.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(h.createSignedUrls.mock.calls[0]![1]).toEqual(["a/1.jpg", "a/2.jpg", "a/3.jpg"]);

    // segunda vez: vem do cache, mesma URL (o navegador consegue reaproveitar a imagem) e sem nova chamada
    expect(peekPhotoUrl("a/2.jpg")).toBe("https://x/a/2.jpg?t=1");
    expect(await getPhotoUrl("a/2.jpg")).toBe("https://x/a/2.jpg?t=1");
    expect(h.createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("foto inexistente ou falha de rede devolve null sem quebrar as demais", async () => {
    h.createSignedUrls.mockResolvedValueOnce({
      data: [
        { path: "ok.jpg", signedUrl: "https://x/ok.jpg", error: null },
        { path: "sumiu.jpg", signedUrl: null, error: "Object not found" },
      ],
    });
    const [ok, missing] = await Promise.all([getPhotoUrl("ok.jpg"), getPhotoUrl("sumiu.jpg")]);
    expect(ok).toBe("https://x/ok.jpg");
    expect(missing).toBeNull();

    h.createSignedUrls.mockRejectedValueOnce(new Error("offline"));
    expect(await getPhotoUrl("outra.jpg")).toBeNull();
  });
});

describe("otimização das fotos existentes", () => {
  it("reduz só as fotos pesadas, no mesmo caminho, e ignora as leves e as que não encolhem", async () => {
    h.download.mockImplementation(async (_b: string, p: string) => ({
      data: p === "u/grande.jpg" ? blobOf(150) : p === "u/leve.jpg" ? blobOf(20) : blobOf(120),
      error: null,
    }));
    h.compress.mockImplementation(async (file: File) => (file.name === "teimosa.jpg" ? file : blobOf(15)));
    h.upload.mockResolvedValue({ error: null });

    const progress: number[] = [];
    const r = await optimizeMemberPhotos(["u/grande.jpg", "u/leve.jpg", "u/teimosa.jpg", "u/grande.jpg"], (d) => progress.push(d));

    expect(r).toMatchObject({ total: 3, optimized: 1, skipped: 2, failed: 0 });
    expect(r.savedBytes).toBe((150 - 15) * 1024);
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.upload).toHaveBeenCalledWith("member-photos", "u/grande.jpg", expect.any(Blob), expect.objectContaining({ upsert: true }));
    expect(progress.at(-1)).toBe(3);
  });

  it("conta falhas (download ou envio) e segue com as outras", async () => {
    h.download.mockImplementation(async (_b: string, p: string) => (p === "u/erro.jpg" ? { data: null, error: new Error("x") } : { data: blobOf(100), error: null }));
    h.compress.mockResolvedValue(blobOf(10));
    h.upload.mockImplementation(async (_b: string, p: string) => ({ error: p === "u/falha-envio.jpg" ? new Error("y") : null }));
    const r = await optimizeMemberPhotos(["u/erro.jpg", "u/falha-envio.jpg", "u/boa.jpg"]);
    expect(r).toMatchObject({ total: 3, optimized: 1, failed: 2 });
  });
});
