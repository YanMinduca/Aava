/** Sons curtos gerados no próprio navegador (sem arquivos de áudio). */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Chame num clique (iniciar a câmera) para o navegador liberar o som depois. */
export function unlockAudio() {
  audio();
}

/** "Leu o QR code": dois toques curtos subindo. */
export function playRead() {
  tone(880, 0, 0.12, "sine", 0.25);
  tone(1320, 0.1, 0.18, "sine", 0.25);
  if (typeof navigator !== "undefined") navigator.vibrate?.(60);
}

/** Aviso (já usado, inválido ou cancelado): dois toques graves. */
export function playWarning() {
  tone(260, 0, 0.18, "square", 0.12);
  tone(200, 0.2, 0.28, "square", 0.12);
  if (typeof navigator !== "undefined") navigator.vibrate?.([120, 60, 120]);
}
