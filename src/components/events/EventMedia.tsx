import { useEffect, useState } from "react";
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

/** true só quando a tela é de computador/tablet (md ou maior). No servidor e no primeiro desenho é false. */
function useIsDesktop() {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const sync = () => setYes(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return yes;
}

/**
 * Miniatura do evento (landing, lista de eventos e painel). Foto e vídeo aparecem de verdade (o vídeo mostra o primeiro
 * quadro). O Instagram não entrega imagem para outros sites, então ele aparece como um cartão; o post de verdade
 * abre na página do evento. Sem mídia, não desenha nada.
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
  return (
    <div
      className={`${box} grid place-items-center bg-gradient-to-br from-fuchsia-600 via-rose-500 to-amber-400 text-white`}
      data-testid="event-thumb"
    >
      <div className="flex flex-col items-center gap-1.5">
        <Instagram className="h-9 w-9" aria-hidden />
        <span className="text-sm font-medium">Post do Instagram</span>
      </div>
    </div>
  );
}

/**
 * Mídia completa, acima da descrição na página do evento. Só aparece no computador: no celular nada é desenhado nem
 * baixado (a caixa fica com `hidden` e o conteúdo só é montado quando a tela é larga).
 */
export function EventMediaFull({ event }: { event: EventMediaFields }) {
  const media = eventMediaFrom(event);
  const desktop = useIsDesktop();
  if (!media) return null;

  return (
    <div className="mt-8 hidden md:block" data-testid="event-media-full">
      {desktop && media.type === "image" && (
        <img
          src={eventMediaUrl(media.path)}
          alt=""
          decoding="async"
          className="max-h-[28rem] w-full rounded-2xl border object-cover"
        />
      )}
      {desktop && media.type === "video" && (
        <video
          src={eventMediaUrl(media.path)}
          controls
          playsInline
          preload="metadata"
          className="max-h-[28rem] w-full rounded-2xl border bg-black"
        />
      )}
      {desktop && media.type === "instagram" && <InstagramEmbed url={media.url} />}
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
