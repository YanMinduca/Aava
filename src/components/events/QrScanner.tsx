import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/** Lê QR codes pela câmera (precisa de HTTPS ou localhost). Chama onScan uma vez por leitura. */
export function QrScanner({ onScan }: { onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const last = { code: "", at: 0 };
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Este navegador não permite usar a câmera aqui. Abra o site com HTTPS ou digite o código manualmente.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setError("Não foi possível acessar a câmera. Libere a permissão no navegador ou digite o código manualmente.");
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setReady(true);
      const tick = () => {
        if (stopped) return;
        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (found?.data && (found.data !== last.code || Date.now() - last.at > 3500)) {
            last.code = found.data;
            last.at = Date.now();
            onScanRef.current(found.data);
          }
        }
        timer = setTimeout(tick, 200);
      };
      tick();
    }
    start();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-black">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover sm:aspect-video" />
      {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">Abrindo a câmera...</p>}
      <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
    </div>
  );
}
