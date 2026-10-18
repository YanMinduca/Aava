-- 1) Código curto do ingresso (para digitar quando a câmera não lê) e 2) bucket público das imagens do site.
-- Pode rodar mais de uma vez.

create or replace function public.gen_ticket_short_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sem I, L, O, 0 e 1 (evita confusão)
  candidate text; i int; bytes bytea;
begin
  loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    candidate := '';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.event_tickets t where t.short_code = candidate);
  end loop;
  return candidate;
end $$;

alter table public.event_tickets add column if not exists short_code text;
do $$
declare r record;
begin
  for r in select id from public.event_tickets where short_code is null loop
    update public.event_tickets set short_code = public.gen_ticket_short_code() where id = r.id;
  end loop;
end $$;
alter table public.event_tickets alter column short_code set default public.gen_ticket_short_code();
alter table public.event_tickets alter column short_code set not null;
create unique index if not exists event_tickets_short_code_key on public.event_tickets (short_code);
revoke all on function public.gen_ticket_short_code() from public, anon, authenticated;

-- Check-in aceita o código do QR (longo) ou o código curto digitado (com ou sem traço, qualquer caixa)
create or replace function public.checkin_ticket(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t public.event_tickets%rowtype; ev_title text; r public.event_registrations%rowtype; lot_name text;
  raw text := btrim(coalesce(_code, ''));
  norm text := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not (public.has_permission(auth.uid(), 'checkin_events') or public.has_permission(auth.uid(), 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  select * into t from public.event_tickets where code = raw or (length(norm) = 8 and short_code = norm) limit 1;
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  select title into ev_title from public.events where id = t.event_id;
  select * into r from public.event_registrations where id = t.registration_id;
  select name into lot_name from public.event_lots where id = r.lot_id;
  if t.status = 'cancelled' or r.status <> 'confirmed' then
    return jsonb_build_object('result', 'cancelled', 'holder_name', t.holder_name, 'event_title', ev_title, 'short_code', t.short_code);
  end if;
  if t.status = 'checked_in' then
    return jsonb_build_object('result', 'already', 'holder_name', t.holder_name, 'event_title', ev_title, 'lot', lot_name,
                              'checked_in_at', t.checked_in_at, 'short_code', t.short_code);
  end if;
  update public.event_tickets set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid() where id = t.id;
  return jsonb_build_object('result', 'ok', 'holder_name', t.holder_name, 'event_title', ev_title, 'lot', lot_name,
                            'ticket_id', t.id, 'short_code', t.short_code);
end $$;

-- Imagens do site (fotos da página inicial e QR do Pix): ficam no armazenamento, não mais dentro do banco.
-- Bucket público (o site é público); só CEO e Pastor Presidente gravam.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "site assets insert" on storage.objects;
create policy "site assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()));
drop policy if exists "site assets update" on storage.objects;
create policy "site assets update" on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()))
  with check (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()));
drop policy if exists "site assets delete" on storage.objects;
create policy "site assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()));
-- Quem grava também precisa poder ler (o envio devolve a linha criada); o público lê pela URL pública do bucket.
drop policy if exists "site assets select" on storage.objects;
create policy "site assets select" on storage.objects for select to authenticated
  using (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()));
