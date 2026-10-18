import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,AAAA" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { TicketCard } from "@/components/events/MyTickets";
import { ScanFeedback } from "@/components/events/QrScanner";
import { fileExt, formatShortCode, siteAssetPath, siteAssetPaths } from "@/lib/images";
import { playRead, playWarning, unlockAudio } from "@/lib/sounds";

afterEach(cleanup);

const ticket = (over: Partial<Tables<"event_tickets">> = {}): Tables<"event_tickets"> => ({
  id: "t1", registration_id: "r1", event_id: "e1", seq: 1, code: "a".repeat(64), short_code: "K7M29QXA", holder_name: "Maria Souza",
  status: "valid", checked_in_at: null, checked_in_by: null, created_at: "2026-10-18T10:00:00Z", ...over,
});

describe("ingresso do membro", () => {
  it("mostra o QR e o código para digitar enquanto o ingresso é válido", async () => {
    render(<TicketCard ticket={ticket()} total={2} />);
    expect(screen.getByLabelText("Código do ingresso").textContent).toBe("K7M2-9QXA");
    expect(screen.getByText(/Se a câmera não ler/)).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/QR code do ingresso de Maria Souza/)).toBeTruthy());
    expect(screen.queryByText("Presença confirmada")).toBeNull();
  });

  it("depois da presença confirmada some o QR e o código e aparece só 'Presença confirmada'", async () => {
    render(<TicketCard ticket={ticket({ status: "checked_in", checked_in_at: "2026-10-18T19:30:00Z" })} total={1} />);
    expect(screen.getByText("Presença confirmada")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByLabelText("Código do ingresso")).toBeNull();
    expect(screen.queryByText(/Se a câmera não ler/)).toBeNull();
  });

  it("ingresso cancelado não mostra QR", () => {
    render(<TicketCard ticket={ticket({ status: "cancelled" })} total={1} />);
    expect(screen.getByText("Ingresso cancelado")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("sinal da câmera", () => {
  it("mostra o certinho de leitura, o aviso e o erro", () => {
    const { rerender } = render(<ScanFeedback kind="ok" />);
    expect(screen.getByText("QR code lido")).toBeTruthy();
    rerender(<ScanFeedback kind="warn" />);
    expect(screen.getByText("Atenção")).toBeTruthy();
    rerender(<ScanFeedback kind="error" />);
    expect(screen.getByText("Ingresso não aceito")).toBeTruthy();
  });
  it("os sons não quebram em navegador sem áudio", () => {
    expect(() => { unlockAudio(); playRead(); playWarning(); }).not.toThrow();
  });
});

describe("imagens no armazenamento", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public/site-assets";
  it("extrai o caminho do arquivo a partir da URL pública", () => {
    expect(siteAssetPath(`${base}/photos/x.jpg`)).toBe("photos/x.jpg");
    expect(siteAssetPath(`${base}/pix/y.png?v=2`)).toBe("pix/y.png");
    expect(siteAssetPath("https://outro.site/foto.jpg")).toBeNull();
    expect(siteAssetPath(undefined)).toBeNull();
  });
  it("lista só os arquivos do bucket usados por fotos e QR do Pix", () => {
    const paths = siteAssetPaths({
      photos: [{ url: `${base}/photos/a.jpg` }, { url: "https://externo/b.jpg" }],
      pixKeys: [{ qrCode: `${base}/pix/c.png` }, {}],
    });
    expect(paths).toEqual(["photos/a.jpg", "pix/c.png"]);
  });
  it("formata o código curto e escolhe a extensão pelo conteúdo", () => {
    expect(formatShortCode("k7m29qxa")).toBe("K7M2-9QXA");
    expect(formatShortCode(null)).toBe("");
    expect(fileExt(new Blob([], { type: "image/png" }))).toBe("png");
    expect(fileExt(new Blob([], { type: "image/jpeg" }))).toBe("jpg");
    expect(fileExt(new Blob([], { type: "application/pdf" }))).toBe("pdf");
    expect(fileExt(new Blob([], { type: "" }), "Recibo.PDF")).toBe("pdf");
  });
});
