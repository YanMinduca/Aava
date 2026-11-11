import { useEffect, useRef } from "react";
import { ExternalLink, Instagram, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  EVENT_MEDIA_BUCKET,
  eventMediaFrom,
  instagramEmbedUrl,
  parseInstagramUrl,
  type EventMediaFields,
} from "@/lib/event-media";

/** Endereço público do arquivo (o bucket event-media é público: a divulgação do evento é para todo mundo). */
export const eventMediaUrl = (path: string) =>
  supabase.storage.from(EVENT_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

/**
 * Miniatura do evento (landing, lista de eventos e painel). Foto e vídeo aparecem de verdade (o vídeo mostra o primeiro
 * quadro). O post do Instagram aparece de verdade (o conteúdo do post, sem o cabeçalho), não só o ícone.
 * Sem mídia, não desenha nada.
 */
export function EventThumb({
  event,
  className = "",
}: {
  event: EventMediaFields;
  className?: string;
}) {
  const media = eventMediaFrom(event);
  if (!media) return null;
  const box = `relative aspect-video w-full overflow-hidden bg-muted ${className}`;

  if (media.type === "image") {
    return (
      <div className={box} data-testid="event-thumb">
        <img
          src={eventMediaUrl(media.path)}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  if (media.type === "video") {
    return (
      <div className={box} data-testid="event-thumb">
        <video
          src={`${eventMediaUrl(media.path)}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none h-full w-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white">
            <Play className="h-5 w-5 translate-x-0.5" aria-hidden />
          </span>
        </span>
      </div>
    );
  }
  return media.type === "instagram" ? <InstagramThumb url={media.url} className={className} /> : null;
}

/**
 * Miniatura de post do Instagram: mostra o conteúdo do post (foto/capa do reel) usando a página de embed oficial,
 * recortada para esconder o cabeçalho. O iframe não recebe cliques (o cartão inteiro continua sendo o link do evento).
 * Se o link não puder ser lido, cai no cartão com o ícone.
 */
function InstagramThumb({ url, className = "" }: { url: string; className?: string }) {
  const post = parseInstagramUrl(url);
  if (!post) {
    return (
      <div
        className={`relative grid aspect-video w-full place-items-center overflow-hidden bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-400 text-white ${className}`}
        data-testid="event-thumb"
      >
        <Instagram className="h-9 w-9" aria-hidden />
      </div>
    );
  }
  return (
    <div
      className={`relative aspect-square w-full overflow-hidden bg-white ${className}`}
      data-testid="event-thumb"
    >
      <iframe
        src={instagramEmbedUrl(post)}
        title="Post do Instagram do evento"
        loading="lazy"
        scrolling="no"
        tabIndex={-1}
        aria-hidden
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin"
        className="pointer-events-none absolute left-0 top-[-56px] w-full border-0"
        style={{ height: "calc(100% + 56px + 220px)" }}
      />
      <span className="pointer-events-none absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white">
        <Instagram className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}

/**
 * Vídeo da página de inscrição: começa sozinho, sem som (celulares e navegadores só liberam reprodução automática
 * com o vídeo mudo). Os controles ficam visíveis para a pessoa ligar o som ou pausar.
 */
function AutoPlayVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // O atributo "muted" do React nem sempre chega ao elemento; no iOS/Chrome sem isso o play() é bloqueado.
    v.muted = true;
    v.defaultMuted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      controls
      autoPlay
      muted
      playsInline
      preload="auto"
      className="max-h-[28rem] w-full rounded-2xl border bg-black"
      data-testid="event-video"
    />
  );
}

/** Mídia completa, acima da descrição na página do evento. Aparece no celular e no computador. */
export function EventMediaFull({ event }: { event: EventMediaFields }) {
  const media = eventMediaFrom(event);
  if (!media) return null;

  return (
    <div className="mt-8" data-testid="event-media-full">
      {media.type === "image" && (
        <img
          src={eventMediaUrl(media.path)}
          alt=""
          decoding="async"
          className="max-h-[28rem] w-full rounded-2xl border object-cover"
        />
      )}
      {media.type === "video" && <AutoPlayVideo src={eventMediaUrl(media.path)} />}
      {media.type === "instagram" && <InstagramEmbed url={media.url} />}
    </div>
  );
}

function InstagramEmbed({ url }: { url: string }) {
  const post = parseInstagramUrl(url);
  if (!post) return null;
  return (
    <div className="mx-auto max-w-[420px]">
      <iframe
        src={instagramEmbedUrl(post)}
        title="Post do Instagram do evento"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className="h-[620px] w-full rounded-2xl border bg-white"
      />
      <a
        href={post.canonical}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline"
      >
        <ExternalLink className="h-4 w-4" /> Abrir no Instagram
      </a>
    </div>
  );
}
