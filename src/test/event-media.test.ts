import { describe, expect, it } from "vitest";
import {
  checkMediaFile,
  eventMediaFrom,
  instagramEmbedUrl,
  parseInstagramUrl,
} from "@/lib/event-media";
import { previewRemoval, removalReasonIsValid } from "@/lib/event-removal";
import { asksReligion } from "@/lib/events";

describe("post do Instagram", () => {
  it("aceita post, reel e link com parâmetros, e monta o link canônico", () => {
    expect(parseInstagramUrl("https://www.instagram.com/p/Cabc123XYZ/")?.canonical).toBe(
      "https://www.instagram.com/p/Cabc123XYZ/",
    );
    expect(parseInstagramUrl("https://instagram.com/reel/Cabc123XYZ/?igsh=abc")?.kind).toBe("reel");
    expect(parseInstagramUrl("https://www.instagram.com/igreja/p/Cabc123XYZ")?.code).toBe(
      "Cabc123XYZ",
    );
    expect(instagramEmbedUrl(parseInstagramUrl("https://instagram.com/p/Cabc123XYZ")!)).toBe(
      "https://www.instagram.com/p/Cabc123XYZ/embed",
    );
  });
  it("recusa outros sites, http e javascript:", () => {
    for (const u of [
      "",
      "http://instagram.com/p/Cabc123XYZ/",
      "https://evil.com/p/Cabc123XYZ/",
      "https://instagram.com.evil.com/p/Cabc123XYZ/",
      "javascript:alert(1)",
      "https://www.instagram.com/igreja/",
    ]) {
      expect(parseInstagramUrl(u)).toBeNull();
    }
  });
});

describe("mídia do evento", () => {
  it("só devolve mídia coerente", () => {
    expect(eventMediaFrom({ media_type: "image", media_path: "a.jpg" })).toEqual({
      type: "image",
      path: "a.jpg",
      url: null,
    });
    expect(eventMediaFrom({ media_type: "image", media_path: null })).toBeNull();
    expect(eventMediaFrom({ media_type: "instagram", media_url: "https://evil.com/x" })).toBeNull();
    expect(eventMediaFrom({})).toBeNull();
  });
  it("confere tipo e tamanho do arquivo", () => {
    const f = (type: string, size: number) => ({ type, size }) as File;
    expect(checkMediaFile("image", f("image/png", 1000))).toBeNull();
    expect(checkMediaFile("image", f("video/mp4", 1000))).not.toBeNull();
    expect(checkMediaFile("video", f("video/mp4", 51 * 1024 * 1024))).not.toBeNull();
    expect(checkMediaFile("video", f("video/mp4", 5 * 1024 * 1024))).toBeNull();
  });
});

describe("remoção de ingressos", () => {
  it("remover parte reduz quantidade e total e calcula o que devolver", () => {
    expect(previewRemoval({ unitPrice: 50, quantity: 3, removing: 1, paidSum: 0 })).toEqual({
      cancelsRegistration: false,
      newQuantity: 2,
      newTotal: 100,
      refundDue: 0,
    });
    expect(
      previewRemoval({ unitPrice: 50, quantity: 3, removing: 1, paidSum: 150 }).refundDue,
    ).toBe(50);
  });
  it("remover todos cancela a inscrição", () => {
    const p = previewRemoval({ unitPrice: 50, quantity: 2, removing: 2, paidSum: 100 });
    expect(p.cancelsRegistration).toBe(true);
    expect(p.refundDue).toBe(100);
  });
  it("a observação é obrigatória (3 a 500 caracteres)", () => {
    expect(removalReasonIsValid("  ab ")).toBe(false);
    expect(removalReasonIsValid("Desistiu")).toBe(true);
    expect(removalReasonIsValid("x".repeat(501))).toBe(false);
  });
});

describe("religião no evento", () => {
  it("só desliga com false explícito", () => {
    expect(asksReligion({})).toBe(true);
    expect(asksReligion({ ask_religion: true })).toBe(true);
    expect(asksReligion({ ask_religion: false })).toBe(false);
  });
});
