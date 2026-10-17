import QRCode from "qrcode";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { cpfDigits, eventError, formatCpf, isValidCpf, lotIsOpen, registrationIsOpen, slugify, toLocalInput } from "@/lib/events";

describe("CPF", () => {
  it("aceita CPFs com dígitos verificadores corretos e recusa os inválidos", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });
  it("formata e extrai dígitos", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("529982")).toBe("529.982");
    expect(cpfDigits("529.982.247-25")).toBe("52998224725");
  });
});

describe("utilidades de evento", () => {
  it("gera slug sem acento e sem símbolos", () => {
    expect(slugify("Retiro de Jovens 2026 — Água Viva!")).toBe("retiro-de-jovens-2026-agua-viva");
  });
  it("respeita a janela de inscrição e o período do lote", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(registrationIsOpen({ registration_opens_at: "2026-10-01T00:00:00Z", registration_closes_at: "2026-10-20T00:00:00Z" }, now)).toBe(true);
    expect(registrationIsOpen({ registration_opens_at: "2026-10-11T00:00:00Z", registration_closes_at: null }, now)).toBe(false);
    expect(registrationIsOpen({ registration_opens_at: null, registration_closes_at: "2026-10-09T00:00:00Z" }, now)).toBe(false);
    const lot = { id: "l", name: "Lote 1", price: 10, capacity: 5, spots_left: 5, public_access: true, opens_at: null, closes_at: "2026-10-09T00:00:00Z" };
    expect(lotIsOpen(lot, now)).toBe(false);
  });
  it("converte data local para o campo datetime-local", () => {
    const iso = new Date(2026, 9, 10, 18, 30).toISOString();
    expect(toLocalInput(iso)).toBe("2026-10-10T18:30");
    expect(toLocalInput(null)).toBe("");
  });
  it("traduz erros do banco para mensagens em português", () => {
    expect(eventError(new Error("sold_out"))).toMatch(/vagas/);
    expect(eventError(new Error("limit_exceeded"))).toMatch(/limite/);
    expect(eventError({ message: "duplicate key value violates unique constraint \"events_slug_key\"" })).toMatch(/endereço/);
  });
});

describe("QR code do ingresso", () => {
  it("o código do ingresso gerado pode ser lido de volta pelo leitor da câmera", () => {
    const code = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const qr = QRCode.create(code, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const scale = 8;
    const margin = 4;
    const side = (n + margin * 2) * scale;
    const data = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (qr.modules.get(x, y))
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const px = ((y + margin) * scale + dy) * side + (x + margin) * scale + dx;
              data[px * 4] = data[px * 4 + 1] = data[px * 4 + 2] = 0;
            }
    expect(jsQR(data, side, side)?.data).toBe(code);
  });
});
