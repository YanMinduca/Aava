import QRCode from "qrcode";

export type TicketImageInput = {
  /** Conteúdo do QR (o código do ingresso lido pelo check-in). */
  code: string;
  holderName: string;
  eventTitle: string;
  /** Data/hora do evento já formatada (opcional). */
  eventDate?: string;
  /** Código curto (para digitar na entrada). */
  shortCode?: string;
  lotName?: string;
};

export const ticketFileName = (name: string) =>
  `ingresso-${
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "convidado"
  }.png`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("qr_image_failed"));
    img.src = src;
  });
}

/** Quebra o texto em linhas que cabem em maxWidth (no máximo maxLines; o excesso vira reticências). */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !cur) cur = test;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s*\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

/**
 * Desenha o ingresso como imagem PNG (nome do dono, evento, QR code e código curto), pronta para salvar na galeria
 * e enviar por WhatsApp. Devolve uma data URL.
 */
export async function renderTicketPng(i: TicketImageInput): Promise<string> {
  const W = 900;
  const H = 1340;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Faixa de cima
  ctx.fillStyle = "#1f2937";
  ctx.fillRect(0, 0, W, 210);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("INGRESSO", W / 2, 70);
  ctx.font = "700 46px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const titleLines = wrapLines(ctx, i.eventTitle, W - 120, 2);
  titleLines.forEach((l, n) => ctx.fillText(l, W / 2, 130 + n * 54));
  if (i.eventDate) {
    ctx.font = "400 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillStyle = "#d1d5db";
    ctx.fillText(i.eventDate, W / 2, titleLines.length > 1 ? 245 : 190);
  }

  // Nome do dono do ingresso
  ctx.fillStyle = "#6b7280";
  ctx.font = "400 26px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Ingresso de", W / 2, 320);
  ctx.fillStyle = "#111827";
  ctx.font = "700 52px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const nameLines = wrapLines(ctx, i.holderName, W - 100, 2);
  nameLines.forEach((l, n) => ctx.fillText(l, W / 2, 385 + n * 62));
  const afterName = 385 + (nameLines.length - 1) * 62;

  // QR code
  const qrUrl = await QRCode.toDataURL(i.code, { width: 640, margin: 1, errorCorrectionLevel: "M" });
  const qr = await loadImage(qrUrl);
  const qrY = afterName + 50;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 4;
  ctx.strokeRect(110, qrY - 10, 680, 680);
  ctx.drawImage(qr, 130, qrY + 10, 640, 640);

  // Código curto
  const textY = qrY + 720;
  if (i.shortCode) {
    const c = i.shortCode.toUpperCase();
    const pretty = c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
    ctx.fillStyle = "#111827";
    ctx.font = "700 48px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillText(pretty, W / 2, textY);
    ctx.fillStyle = "#6b7280";
    ctx.font = "400 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("Se a câmera não ler o QR, informe este código na entrada.", W / 2, textY + 42);
  }
  if (i.lotName) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "400 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(i.lotName, W / 2, H - 30);
  }
  return canvas.toDataURL("image/png");
}

/** Converte a data URL em arquivo (para o menu de compartilhar do celular). */
export async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: "image/png" });
}
