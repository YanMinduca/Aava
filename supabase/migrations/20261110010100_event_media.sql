-- Mídia de divulgação do evento: uma foto, um vídeo (arquivo) ou um post do Instagram (link).
-- Aparece como thumbnail do evento (landing, lista de eventos e painel) e acima da descrição na página de inscrição (só no computador).
--
-- media_type = 'image' | 'video'  -> media_path = caminho do arquivo no bucket público event-media
-- media_type = 'instagram'        -> media_url  = link do post/reel (só instagram.com)
-- Idempotente. A função public_events muda de assinatura (novas colunas), por isso é recriada.

alter table public.events
  add column if not exists media_type text,
  add column if not exists media_path text,
  add column if not exists media_url text;

alter table public.events drop constraint if exists events_media_check;
alter table public.events add constraint events_media_check check (
  (media_type is null and media_path is null and media_url is null)
  or (media_type in ('image', 'video') and media_path is not null and media_url is null)
  or (media_type = 'instagram' and media_path is null
      and media_url ~ '^https://(www\.)?instagram\.com/([A-Za-z0-9._]+/)?(p|reel|reels|tv)/[A-Za-z0-9_-]{5,}/?([?#].*)?$')
);

-- Bucket público: a foto/vídeo do evento é divulgação, qualquer visitante do site precisa ver.
-- Só quem gerencia eventos envia arquivos. A exclusão passa pela lixeira de arquivos (storage_trash), como as demais.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "event media insert" on storage.objects;
create policy "event media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and public.has_permission(auth.uid(), 'manage_events'));

-- Arquivo trocado ou evento excluído: o caminho antigo entra na lixeira de arquivos para ser apagado do armazenamento.
drop trigger if exists trash_files on public.events;
create trigger trash_files after delete or update of media_path on public.events
  for each row execute function public.trash_file_trigger('event-media', 'media_path');

-- O bucket novo entra nas funções que decidem se um arquivo ainda está em uso e na busca de arquivos sobrando.
create or replace function public.storage_path_in_use(_bucket text, _path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case _bucket
    when 'member-photos' then exists (select 1 from public.members where photo_path = _path)
    when 'receipts' then exists (select 1 from public.financial_transactions where receipt_path = _path)
    when 'event-proofs' then exists (select 1 from public.event_payments where proof_path = _path)
    when 'event-assets' then exists (select 1 from public.event_payment_info where pix_qr_path = _path)
    when 'event-media' then exists (select 1 from public.events where media_path = _path)
    when 'site-assets' then exists (select 1 from public.site_content where strpos(content::text, '/site-assets/' || _path) > 0)
    else true
  end;
$$;

create or replace function public.storage_orphans_preview()
returns table (bucket text, path text, size bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
  return query
    select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
    from storage.objects o
    where o.bucket_id in ('member-photos', 'receipts', 'event-proofs', 'event-assets', 'event-media', 'site-assets')
      and o.name not like '%.emptyFolderPlaceholder'
      and o.created_at < now() - interval '1 day'
      and not public.storage_path_in_use(o.bucket_id, o.name)
    order by o.bucket_id, o.created_at;
end $$;

revoke all on function public.storage_path_in_use(text, text), public.storage_orphans_preview() from public, anon, authenticated;
grant execute on function public.storage_orphans_preview() to authenticated;

-- Lista pública de eventos agora devolve também a mídia (para a thumbnail).
drop function if exists public.public_events();
create function public.public_events()
returns table (id uuid, slug text, title text, description text, location text, starts_at timestamptz, ends_at timestamptz,
               registration_opens_at timestamptz, registration_closes_at timestamptz, audience text, payment_enabled boolean,
               min_price numeric, spots_left int, registration_open boolean,
               media_type text, media_path text, media_url text)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.description, e.location, e.starts_at, e.ends_at, e.registration_opens_at, e.registration_closes_at,
         e.audience, e.payment_enabled,
         (select min(l.price) from public.event_lots l where l.event_id = e.id),
         case when exists (select 1 from public.event_lots l where l.event_id = e.id and l.capacity is null) then null
              else (select coalesce(sum(greatest(l.capacity - public.lot_taken(l.id), 0)), 0)::int from public.event_lots l where l.event_id = e.id) end,
         (coalesce(e.registration_opens_at, '-infinity') <= now() and coalesce(e.registration_closes_at, 'infinity') >= now()),
         e.media_type, e.media_path, e.media_url
  from public.events e
  where e.published and coalesce(e.ends_at, e.starts_at) >= now() - interval '1 day'
  order by e.starts_at;
$$;

revoke all on function public.public_events() from public;
grant execute on function public.public_events() to anon, authenticated;
