import { afterEach, describe, expect, it, vi } from "vitest";
import { uuid } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

describe("uuid", () => {
  it("usa crypto.randomUUID quando o navegador oferece", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    expect(uuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("funciona em página http:// (sem randomUUID), gerando UUID v4 válido e diferente a cada chamada", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; } });
    const ids = Array.from({ length: 200 }, () => uuid());
    expect(ids.every((id) => V4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(200);
  });

  it("ainda funciona se não houver nenhum crypto", () => {
    vi.stubGlobal("crypto", undefined);
    expect(uuid()).toMatch(V4);
  });
});

import { copyText } from "@/lib/clipboard";

describe("copyText", () => {
  it("usa o método antigo (execCommand) em página sem clipboard, como http://", async () => {
    vi.stubGlobal("navigator", {});
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: typeof exec }).execCommand = exec;
    expect(await copyText("chave-pix")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });
  it("usa navigator.clipboard quando a página é segura", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("isSecureContext", true);
    expect(await copyText("abc")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("abc");
  });
});
