-- Parte 2: "lixeira" de arquivos. Ao apagar (ou trocar) uma linha que aponta para um arquivo do armazenamento,
-- o banco anota o arquivo aqui; o painel então apaga o arquivo de verdade (SQL não pode apagar arquivos do storage).
-- Pode rodar mais de uma vez.

create table if not exists public.storage_trash (
  id bigint generated always as identity primary key,
  bucket text not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
alter table public.storage_trash enable row level security;
revoke all on public.storage_trash from anon, authenticated;

create or replace function public.enqueue_storage_trash(_bucket text, _path text)
returns void language sql security definer set search_path = public as $$
  insert into public.storage_trash (bucket, path)
  select _bucket, _path where coalesce(btrim(_path), '') <> ''
  on conflict (bucket, path) do nothing;
$$;

create or replace function public.trash_file_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare b text := tg_argv[0]; col text := tg_argv[1]; old_path text; new_path text;
begin
  old_path := to_jsonb(old) ->> col;
  if tg_op = 'DELETE' then
    perform public.enqueue_storage_trash(b, old_path);
    return old;
  end if;
  new_path := to_jsonb(new) ->> col;
  if old_path is not null and old_path is distinct from new_path then
    perform public.enqueue_storage_trash(b, old_path);
  end if;
  return new;
end $$;

drop trigger if exists trash_files on public.event_payments;
create trigger trash_files after delete or update of proof_path on public.event_payments
  for each row execute function public.trash_file_trigger('event-proofs', 'proof_path');
drop trigger if exists trash_files on public.event_payment_info;
create trigger trash_files after delete or update of pix_qr_path on public.event_payment_info
  for each row execute function public.trash_file_trigger('event-assets', 'pix_qr_path');
drop trigger if exists trash_files on public.members;
create trigger trash_files after delete or update of photo_path on public.members
  for each row execute function public.trash_file_trigger('member-photos', 'photo_path');
drop trigger if exists trash_files on public.financial_transactions;
create trigger trash_files after delete or update of receipt_path on public.financial_transactions
  for each row execute function public.trash_file_trigger('receipts', 'receipt_path');

-- Um arquivo ainda em uso nunca é apagado (bucket desconhecido conta como "em uso")
create or replace function public.storage_path_in_use(_bucket text, _path text)
returns boolean language sql stable security definer set search_path = public as $$
  select case _bucket
    when 'member-photos' then exists (select 1 from public.members where photo_path = _path)
    when 'receipts' then exists (select 1 from public.financial_transactions where receipt_path = _path)
    when 'event-proofs' then exists (select 1 from public.event_payments where proof_path = _path)
    when 'event-assets' then exists (select 1 from public.event_payment_info where pix_qr_path = _path)
    when 'site-assets' then exists (select 1 from public.site_content where strpos(content::text, '/site-assets/' || _path) > 0)
    else true
  end;
$$;

-- Quem pode esvaziar a lixeira inteira: CEO/Pastor Presidente e quem tem alguma permissão liberada; os demais, só a própria pasta
create or replace function public.can_purge_storage(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _user_id is not null and (
    public.is_church_leadership(_user_id) or exists (select 1 from public.user_permissions where user_id = _user_id));
$$;

create or replace function public.storage_trash_next(_limit int default 100)
returns table (id bigint, bucket text, path text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.storage_trash t where public.storage_path_in_use(t.bucket, t.path);
  return query
    select t.id, t.bucket, t.path from public.storage_trash t
    where public.can_purge_storage(auth.uid()) or t.path like auth.uid()::text || '/%'
    order by t.id limit greatest(1, least(coalesce(_limit, 100), 500));
end $$;

create or replace function public.storage_trash_done(_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  delete from public.storage_trash t
   where t.id = any (_ids) and (public.can_purge_storage(auth.uid()) or t.path like auth.uid()::text || '/%');
end $$;

-- Regras do armazenamento: só dá para ler/apagar objeto que está na lixeira (e não está em uso)
create or replace function public.storage_trash_allows(_bucket text, _name text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.storage_trash t where t.bucket = _bucket and t.path = _name)
     and (public.can_purge_storage(auth.uid()) or _name like auth.uid()::text || '/%')
     and not public.storage_path_in_use(_bucket, _name);
$$;

drop policy if exists "trash select" on storage.objects;
create policy "trash select" on storage.objects for select to authenticated using (public.storage_trash_allows(bucket_id, name));
drop policy if exists "trash delete" on storage.objects;
create policy "trash delete" on storage.objects for delete to authenticated using (public.storage_trash_allows(bucket_id, name));

-- Arquivos sem nenhum registro apontando para eles (mais de 1 dia, para não pegar envio em andamento)
create or replace function public.storage_orphans_preview()
returns table (bucket text, path text, size bigint, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
  return query
    select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0), o.created_at
    from storage.objects o
    where o.bucket_id in ('member-photos', 'receipts', 'event-proofs', 'event-assets', 'site-assets')
      and o.name not like '%.emptyFolderPlaceholder'
      and o.created_at < now() - interval '1 day'
      and not public.storage_path_in_use(o.bucket_id, o.name)
    order by o.bucket_id, o.created_at;
end $$;

create or replace function public.storage_enqueue_orphans()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
  with ins as (
    insert into public.storage_trash (bucket, path)
    select p.bucket, p.path from public.storage_orphans_preview() p
    on conflict (bucket, path) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

revoke all on function public.enqueue_storage_trash(text, text), public.trash_file_trigger(), public.storage_path_in_use(text, text),
  public.can_purge_storage(uuid), public.storage_trash_next(int), public.storage_trash_done(bigint[]), public.storage_trash_allows(text, text),
  public.storage_orphans_preview(), public.storage_enqueue_orphans() from public, anon, authenticated;
grant execute on function public.storage_trash_next(int), public.storage_trash_done(bigint[]), public.storage_trash_allows(text, text),
  public.storage_orphans_preview(), public.storage_enqueue_orphans() to authenticated;
