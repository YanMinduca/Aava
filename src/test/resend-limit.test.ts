import { describe, expect, it } from "vitest";
import { RESEND_INTERVAL_MS, RESEND_MAX, RESEND_WINDOW_MS, recordSend, resendStatus, type ResendStore } from "@/lib/resend-limit";

const memory = (): ResendStore => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};
const T0 = 1_000_000_000_000;

describe("limite de reenvio do e-mail de confirmação", () => {
  it("sem nenhum envio anotado, pode reenviar na hora e restam 3", () => {
    expect(resendStatus("a@b.com", T0, memory())).toEqual({ canResend: true, remaining: 3, waitMs: 0, reason: "ok" });
  });

  it("depois do envio da criação da conta é preciso esperar 1 minuto, sem gastar nenhum dos 3 reenvios", () => {
    const s = memory();
    recordSend("a@b.com", { resend: false }, T0, s);
    expect(resendStatus("a@b.com", T0 + 10_000, s)).toMatchObject({ canResend: false, remaining: 3, waitMs: 50_000, reason: "wait" });
    expect(resendStatus("a@b.com", T0 + RESEND_INTERVAL_MS, s)).toMatchObject({ canResend: true, remaining: 3 });
  });

  it("permite no máximo 3 reenvios, sempre com 1 minuto entre eles", () => {
    const s = memory();
    recordSend("a@b.com", { resend: false }, T0, s);
    let t = T0;
    for (let i = 1; i <= RESEND_MAX; i++) {
      t += RESEND_INTERVAL_MS;
      expect(resendStatus("a@b.com", t, s).canResend).toBe(true);
      recordSend("a@b.com", { resend: true }, t, s);
      expect(resendStatus("a@b.com", t + 1000, s).remaining).toBe(RESEND_MAX - i);
    }
    t += RESEND_INTERVAL_MS * 10;
    expect(resendStatus("a@b.com", t, s)).toMatchObject({ canResend: false, remaining: 0, reason: "limit" });
  });

  it("a contagem zera 24 horas depois do primeiro envio", () => {
    const s = memory();
    recordSend("a@b.com", { resend: false }, T0, s);
    for (let i = 1; i <= 3; i++) recordSend("a@b.com", { resend: true }, T0 + i * RESEND_INTERVAL_MS, s);
    expect(resendStatus("a@b.com", T0 + RESEND_WINDOW_MS - 1, s).reason).toBe("limit");
    expect(resendStatus("a@b.com", T0 + RESEND_WINDOW_MS + 1, s)).toMatchObject({ canResend: true, remaining: 3 });
  });

  it("cada e-mail tem a sua contagem (maiúsculas e espaços não importam)", () => {
    const s = memory();
    recordSend("Ana@Email.com ", { resend: true }, T0, s);
    expect(resendStatus("ana@email.com", T0 + RESEND_INTERVAL_MS, s).remaining).toBe(2);
    expect(resendStatus("outra@email.com", T0 + RESEND_INTERVAL_MS, s).remaining).toBe(3);
  });

  it("ignora dados corrompidos guardados no navegador", () => {
    const s: ResendStore = { getItem: () => "{não é json", setItem: () => undefined };
    expect(resendStatus("a@b.com", T0, s)).toMatchObject({ canResend: true, remaining: 3 });
  });
});
