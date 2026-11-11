-- LIXEIRA de tudo que pode ser excluído, BACKUP dos dados e DÍZIMO só para quem tem permissão.
--
-- 1) Lixeira geral (public.trash)
--    * Todo registro apagado de qualquer tabela do sistema (membros, eventos, financeiro, departamentos, pedidos de oração,
--      convites, registros/logs...) é guardado na lixeira por 30 dias e depois apagado de verdade.
--    * Funciona por gatilho no banco (zz_trash_row): nenhuma tela precisa mudar para o item "cair" na lixeira.
--    * Itens apagados juntos (ex.: um evento e suas inscrições, ingressos e parcelas) formam um LOTE e são restaurados juntos.
--    * Arquivos (fotos, comprovantes, mídia de evento, QR do Pix) de itens na lixeira NÃO são apagados do armazenamento;
--      só saem quando o item é excluído de vez ou expira (storage_path_in_use passa a olhar a lixeira).
--    * Só CEO e Pastor Presidente veem, restauram e esvaziam a lixeira.
--    * Exceções propositais (não vão para a lixeira):
--        - exclusão de conta/cadastro por delete_user_account (apagar dados pessoais de verdade, como diz a política de privacidade);
--        - tabelas técnicas: trash, storage_trash, backup_runs, member_claim_attempts, push_subscriptions, profiles;
--        - limpeza automática do registro de atividades com mais de 12 meses.
--    * Tabela nova no futuro: rodar `select public.trash_attach_all();` na migration dela.
-- 2) Logs: CEO apaga registros de atividade (vão para a lixeira) e quem gerencia eventos apaga linhas do histórico de remoções.
-- 3) Backup: funções para exportar todas as tabelas e listar arquivos (CEO/Pastor Presidente ou service_role) + histórico backup_runs.
-- 4) Dízimo: o membro comum deixa de ver as próprias contribuições (política removida).
-- Idempotente.

-- ---------------------------------------------------------------- lixeira
create table if not exists public.trash (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_data jsonb not null,
  label text,
  files jsonb not null default '[]'::jsonb,
  batch bigint not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists trash_batch_idx on public.trash (batch);
create index if not exists trash_deleted_idx on public.trash (deleted_at desc);
create index if not exists trash_expires_idx on public.trash (expires_at);
create index if not exists trash_files_idx on public.trash using gin (files jsonb_path_ops);
alter table public.trash enable row level security;
revoke all on public.trash from anon, authenticated;

create or replace function public.trash_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
end $$;

-- Texto que identifica o item na lixeira.
create or replace function public.trash_label(_table text, _row jsonb)
returns text language sql immutable set search_path = public as $$
  select left(coalesce(
    case _table
      when 'financial_transactions' then
        nullif(concat_ws(' · ', case when _row ->> 'kind' = 'entrada' then 'Receita' else 'Despesa' end,
                         _row ->> 'category', 'R$ ' || replace(coalesce(_row ->> 'amount', '0'), '.', ','), _row ->> 'description'), '')
      when 'event_payments' then 'Parcela ' || coalesce(_row ->> 'installment_no', '?') || ' · R$ ' || replace(coalesce(_row ->> 'amount', '0'), '.', ',')
      when 'event_registrations' then 'Inscrição: ' || coalesce(_row ->> 'attendee_name', '?')
      when 'event_tickets' then 'Ingresso: ' || coalesce(_row ->> 'holder_name', '?')
      when 'event_ticket_removals' then 'Remoção de ingresso: ' || coalesce(_row ->> 'reason', '?')
      when 'user_permissions' then 'Permissão: ' || coalesce(_row ->> 'permission', '?')
      when 'user_roles' then 'Cargo: ' || coalesce(_row ->> 'role', '?')
      else null
    end,
    _row ->> 'full_name', _row ->> 'name', _row ->> 'title', _row ->> 'subject', _row ->> 'summary', _row ->> 'code', _row ->> 'id'), 160);
$$;

-- Arquivos do armazenamento que pertencem à linha (para não apagá-los enquanto ela estiver na lixeira).
create or replace function public.trash_files(_table text, _row jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('bucket', m.bucket, 'path', _row ->> m.col)), '[]'::jsonb)
  from (values ('members', 'member-photos', 'photo_path'),
               ('financial_transactions', 'receipts', 'receipt_path'),
               ('event_payments', 'event-proofs', 'proof_path'),
               ('event_payment_info', 'event-assets', 'pix_qr_path'),
               ('events', 'event-media', 'media_path')) as m(tbl, bucket, col)
  where m.tbl = _table and coalesce(btrim(_row ->> m.col), '') <> '';
$$;

-- Remove lotes da lixeira de vez e manda os arquivos deles para a fila de exclusão do armazenamento.
create or replace function public.trash_remove_batches(_batches bigint[])
returns int language plpgsql security definer set search_path = public as $$
declare f jsonb; n int := 0; r record;
begin
  if _batches is null or array_length(_batches, 1) is null then return 0; end if;
  for r in delete from public.trash t where t.batch = any (_batches) returning t.files loop
    n := n + 1;
    for f in select * from jsonb_array_elements(r.files) loop
      perform public.enqueue_storage_trash(f ->> 'bucket', f ->> 'path');
    end loop;
  end loop;
  return n;
end $$;

-- Apaga de vez o que passou de 30 dias. Chamada pelo cron (se existir), pela tela da lixeira e de vez em quando pelo gatilho.
create or replace function public.purge_expired_trash()
returns int language sql security definer set search_path = public as $$
  select public.trash_remove_batches(coalesce(
    (select array_agg(b.batch) from (select batch from public.trash group by batch having min(expires_at) < now()) b), '{}'));
$$;

create or replace function public.trg_trash_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(old);
begin
  if coalesce(current_setting('app.skip_trash', true), '') = 'on' then return old; end if;
  -- Limpeza automática do registro de atividades (12 meses) não precisa passar pela lixeira.
  if tg_table_name = 'activity_log' and (j ->> 'created_at')::timestamptz < now() - interval '12 months' then return old; end if;
  insert into public.trash (table_name, row_data, label, files, batch, deleted_by)
  values (tg_table_name, j, public.trash_label(tg_table_name, j), public.trash_files(tg_table_name, j), txid_current(), auth.uid());
  if random() < 0.02 then perform public.purge_expired_trash(); end if;
  return old;
end $$;

create or replace function public.trash_attach_all()
returns int language plpgsql security definer set search_path = public as $$
declare t text; n int := 0;
begin
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
       and c.relname <> all (array['trash', 'storage_trash', 'backup_runs', 'member_claim_attempts', 'push_subscriptions', 'profiles'])
  loop
    execute format('drop trigger if exists zz_trash_row on public.%I', t);
    execute format('create trigger zz_trash_row after delete on public.%I for each row execute function public.trg_trash_row()', t);
    n := n + 1;
  end loop;
  return n;
end $$;
select public.trash_attach_all();

-- O arquivo de um item que está na lixeira continua "em uso" (não vai para a faxina do armazenamento).
create or replace function public.storage_path_in_use(_bucket text, _path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
  if exists (select 1 from public.trash t where t.files @> jsonb_build_array(jsonb_build_object('bucket', _bucket, 'path', _path))) then
    return true;
  end if;
  return case _bucket
    when 'member-photos' then exists (select 1 from public.members where photo_path = _path)
    when 'receipts' then exists (select 1 from public.financial_transactions where receipt_path = _path)
    when 'event-proofs' then exists (select 1 from public.event_payments where proof_path = _path)
    when 'event-assets' then exists (select 1 from public.event_payment_info where pix_qr_path = _path)
    when 'event-media' then exists (select 1 from public.events e where to_jsonb(e) ->> 'media_path' = _path)
    when 'site-assets' then exists (select 1 from public.site_content where strpos(content::text, '/site-assets/' || _path) > 0)
    else true
  end;
end $$;

-- ---------------------------------------------------------------- telas da lixeira
create or replace function public.trash_list(_table text default null, _search text default null, _limit int default 50, _offset int default 0)
returns table (id bigint, table_name text, label text, deleted_at timestamptz, expires_at timestamptz, deleted_by_name text, items bigint, total bigint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.trash_guard();
  perform public.purge_expired_trash();
  return query
    with roots as (select min(x.id) as root_id, count(*) as items from public.trash x group by x.batch),
         joined as (select t.*, r.items from roots r join public.trash t on t.id = r.root_id),
         filtered as (
           select j.* from joined j
            where (_table is null or j.table_name = _table)
              and (nullif(btrim(coalesce(_search, '')), '') is null or j.label ilike '%' || btrim(_search) || '%'))
    select f.id, f.table_name, f.label, f.deleted_at, f.expires_at,
           (select coalesce(p.full_name, p.email) from public.profiles p where p.id = f.deleted_by),
           f.items, count(*) over ()
      from filtered f
     order by f.deleted_at desc, f.id desc
     limit greatest(1, least(coalesce(_limit, 50), 200)) offset greatest(coalesce(_offset, 0), 0);
end $$;

create or replace function public.trash_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.trash_guard();
  return jsonb_build_object(
    'items', (select count(*) from public.trash),
    'groups', (select count(distinct batch) from public.trash),
    'bytes', pg_total_relation_size('public.trash'),
    'by_table', coalesce((select jsonb_agg(jsonb_build_object('table', s.table_name, 'groups', s.groups) order by s.groups desc)
                            from (select r.table_name, count(*) as groups
                                    from (select distinct on (batch) batch, table_name from public.trash order by batch, id) r
                                   group by r.table_name) s), '[]'::jsonb));
end $$;

-- Itens de um lote (para "ver o que vai voltar").
create or replace function public.trash_items(_id bigint)
returns table (id bigint, table_name text, label text, row_data jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.trash_guard();
  return query
    select t.id, t.table_name, t.label, t.row_data from public.trash t
     where t.batch = (select x.batch from public.trash x where x.id = _id)
     order by t.id limit 200;
end $$;

create or replace function public.trash_restore(_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.trash%rowtype; it public.trash%rowtype; cols text;
  pending bigint[]; waiting bigint[]; pass int := 0; n int := 0; tbls text[] := '{}'; id_ bigint;
begin
  perform public.trash_guard();
  select * into r from public.trash where id = _id;
  if not found then raise exception 'not_found'; end if;
  select array_agg(t.id order by t.id) into pending from public.trash t where t.batch = r.batch;
  begin
    -- O item apagado primeiro (o "pai") volta antes dos que foram apagados junto com ele. Se algum depender de outro que
    -- ainda não voltou, ele espera a próxima rodada.
    while coalesce(array_length(pending, 1), 0) > 0 loop
      pass := pass + 1;
      if pass > 6 then raise exception 'trash_missing_parent'; end if;
      waiting := '{}';
      foreach id_ in array pending loop
        select * into it from public.trash where id = id_;
        select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into cols
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = it.table_name
           and c.is_generated = 'NEVER' and coalesce(c.identity_generation, '') <> 'ALWAYS';
        begin
          execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', it.table_name, cols)
            using it.row_data;
          n := n + 1;
          tbls := tbls || it.table_name;
        exception when foreign_key_violation then
          waiting := waiting || id_;
        end;
      end loop;
      if array_length(waiting, 1) = array_length(pending, 1) then raise exception 'trash_missing_parent'; end if;
      pending := waiting;
    end loop;
  exception
    when unique_violation then raise exception 'trash_conflict';
    when others then
      if sqlerrm in ('trash_missing_parent', 'trash_conflict') then raise; end if;
      raise exception 'trash_restore_failed' using detail = sqlerrm;
  end;
  delete from public.trash where batch = r.batch;
  return jsonb_build_object('restored', n, 'tables', to_jsonb(tbls));
end $$;

create or replace function public.trash_purge(_ids bigint[])
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.trash_guard();
  return public.trash_remove_batches(coalesce((select array_agg(distinct t.batch) from public.trash t where t.id = any (_ids)), '{}'));
end $$;

create or replace function public.trash_empty()
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.trash_guard();
  return public.trash_remove_batches(coalesce((select array_agg(distinct t.batch) from public.trash t), '{}'));
end $$;

-- ---------------------------------------------------------------- logs
create or replace function public.delete_activity_logs(_ids uuid[] default null, _before timestamptz default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_role(auth.uid(), 'ceo') then raise exception 'Acesso negado'; end if;
  if _ids is null and _before is null then raise exception 'invalid_selection'; end if;
  delete from public.activity_log where (_ids is null or id = any (_ids)) and (_before is null or created_at < _before);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.delete_ticket_removal_log(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission(auth.uid(), 'manage_events') or public.has_permission(auth.uid(), 'verify_event_payments')) then
    raise exception 'Acesso negado';
  end if;
  delete from public.event_ticket_removals where id = _id;
end $$;

-- ---------------------------------------------------------------- exclusão de conta: apaga de verdade (sem lixeira)
create or replace function public.delete_user_account(_user uuid, _delete_member boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not public.is_church_leadership(uid) then raise exception 'Acesso negado'; end if;
  if _user = uid then raise exception 'cannot_delete_self'; end if;
  if not exists (select 1 from auth.users where id = _user) then raise exception 'user_not_found'; end if;
  if public.has_role(_user, 'ceo') then raise exception 'cannot_delete_ceo'; end if;
  if public.has_role(_user, 'pastor_presidente') and not public.has_role(uid, 'ceo') then raise exception 'only_ceo_deletes_president'; end if;
  -- Dados pessoais de quem teve a conta excluída não ficam guardados na lixeira.
  perform set_config('app.skip_trash', 'on', true);
  if _delete_member then
    delete from public.members where user_id = _user;
  end if;
  delete from auth.users where id = _user;
end $$;
revoke all on function public.delete_user_account(uuid, boolean) from public, anon;
grant execute on function public.delete_user_account(uuid, boolean) to authenticated;

-- remove_event_tickets (v30) refeita só para a faxina de parcelas não ir para a lixeira
create or replace function public.remove_event_tickets(
  _reg uuid, _ticket_ids uuid[], _quantity integer, _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  r public.event_registrations%rowtype;
  v_reason text := regexp_replace(btrim(coalesce(_reason, '')), '\s+', ' ', 'g');
  has_tickets boolean;
  ids uuid[]; k int; found_n int;
  names text[] := '{}';
  new_qty int; new_total numeric; paid_sum numeric; due numeric; refund numeric;
  unpaid uuid[]; unpaid_n int; base numeric; i int;
  removal uuid; cancel_all boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'verify_event_payments') or public.has_permission(uid, 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'invalid_removal_reason'; end if;

  select * into r from public.event_registrations where id = _reg for update;
  if not found then raise exception 'not_found'; end if;
  if r.status = 'cancelled' then raise exception 'registration_cancelled'; end if;

  select exists (select 1 from public.event_tickets where registration_id = _reg) into has_tickets;

  if has_tickets then
    select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(_ticket_ids, '{}')) x;
    k := coalesce(array_length(ids, 1), 0);
    if k = 0 then raise exception 'invalid_removal_selection'; end if;
    select count(*) into found_n from public.event_tickets t where t.registration_id = _reg and t.id = any (ids);
    if found_n <> k then raise exception 'invalid_removal_selection'; end if;
    if exists (select 1 from public.event_tickets t where t.id = any (ids) and t.status = 'checked_in') then
      raise exception 'ticket_checked_in';
    end if;
    if exists (select 1 from public.event_tickets t where t.id = any (ids) and t.status <> 'valid') then
      raise exception 'ticket_not_removable';
    end if;
    select coalesce(array_agg(t.holder_name order by t.seq), '{}') into names from public.event_tickets t where t.id = any (ids);
  else
    k := coalesce(_quantity, 0);
  end if;
  if k < 1 or k > r.quantity then raise exception 'invalid_removal_selection'; end if;

  select coalesce(sum(p.amount), 0) into paid_sum from public.event_payments p where p.registration_id = _reg and p.status = 'paid';
  cancel_all := k >= r.quantity;

  insert into public.event_ticket_removals (event_id, registration_id, tickets_removed, holder_names, reason, registration_cancelled, removed_by)
  values (r.event_id, _reg, k, names, v_reason, cancel_all, uid)
  returning id into removal;

  if has_tickets then
    update public.event_tickets set status = 'cancelled', removal_id = removal where id = any (ids);
  end if;

  if cancel_all then
    update public.event_registrations set status = 'cancelled', cancelled_at = now() where id = _reg;
    update public.event_tickets set status = 'cancelled' where registration_id = _reg and status <> 'cancelled';
    update public.event_payments set proof_path = null where registration_id = _reg and proof_path is not null;
    new_qty := 0; new_total := 0;
    refund := round(paid_sum, 2);
  else
    new_qty := r.quantity - k;
    new_total := round(r.unit_price * new_qty, 2);
    if exists (select 1 from public.event_payments where registration_id = _reg) then
      if paid_sum >= new_total then
        -- O que já foi pago cobre o novo total: parcelas ainda não avisadas saem. As "aguardando verificação" ficam
        -- (a pessoa pode ter pago de verdade) para a equipe conferir ou devolver.
        -- Faxina interna (parcelas que deixaram de existir): não vai para a lixeira, porque restaurar uma parcela solta
        -- deixaria a inscrição com valores que não batem.
        perform set_config('app.skip_trash', 'on', true);
        delete from public.event_payments where registration_id = _reg and status = 'pending';
        perform set_config('app.skip_trash', '', true);
      else
        select array_agg(p.id order by p.installment_no) into unpaid
          from public.event_payments p where p.registration_id = _reg and p.status <> 'paid';
        unpaid_n := coalesce(array_length(unpaid, 1), 0);
        if unpaid_n > 0 then
          due := new_total - paid_sum;
          base := round(due / unpaid_n, 2);
          for i in 1..unpaid_n loop
            update public.event_payments
               set amount = case when i = unpaid_n then due - base * (unpaid_n - 1) else base end
             where id = unpaid[i];
          end loop;
        end if;
      end if;
    end if;
    update public.event_registrations set quantity = new_qty, total = new_total where id = _reg;
    refund := round(greatest(paid_sum - new_total, 0), 2);
    -- Se sobraram só parcelas pagas, a inscrição que aguardava pagamento passa a estar quitada e o ingresso sai.
    perform public.refresh_event_registration(_reg);
  end if;

  update public.event_ticket_removals set refund_due = refund where id = removal;

  return jsonb_build_object('removed', k, 'registration_cancelled', cancel_all, 'new_quantity', new_qty,
                            'new_total', new_total, 'paid', round(paid_sum, 2), 'refund_due', refund);
end $function$;

-- ---------------------------------------------------------------- backup
create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid,
  source text not null default 'painel',
  tables int not null default 0,
  rows bigint not null default 0,
  files int not null default 0,
  bytes bigint not null default 0
);
alter table public.backup_runs enable row level security;
revoke all on public.backup_runs from anon, authenticated;

create or replace function public.backup_guard()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then return; end if;
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
end $$;

-- Tabelas que entram no backup (tudo, menos filas técnicas e tokens de aparelho).
create or replace function public.backup_tables()
returns table (table_name text, row_count bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare t text; n bigint;
begin
  perform public.backup_guard();
  for t in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
       and c.relname <> all (array['storage_trash', 'backup_runs', 'member_claim_attempts', 'push_subscriptions'])
     order by c.relname
  loop
    execute format('select count(*) from public.%I', t) into n;
    table_name := t; row_count := n;
    return next;
  end loop;
end $$;

create or replace function public.backup_table_page(_table text, _offset int default 0, _limit int default 1000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  perform public.backup_guard();
  if not exists (select 1 from public.backup_tables() b where b.table_name = _table) then raise exception 'invalid_table'; end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select * from public.%I order by 1 offset %s limit %s) x',
                 _table, greatest(coalesce(_offset, 0), 0), greatest(1, least(coalesce(_limit, 1000), 5000)))
    into res;
  return res;
end $$;

create or replace function public.backup_storage_objects()
returns table (bucket text, name text, size bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.backup_guard();
  return query
    select o.bucket_id::text, o.name::text, coalesce((o.metadata ->> 'size')::bigint, 0)
      from storage.objects o where o.name not like '%.emptyFolderPlaceholder' order by o.bucket_id, o.name;
end $$;

create or replace function public.backup_record(_tables int, _rows bigint, _files int, _bytes bigint, _source text default 'painel')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.backup_guard();
  insert into public.backup_runs (created_by, source, tables, rows, files, bytes)
  values (auth.uid(), left(coalesce(_source, 'painel'), 30), coalesce(_tables, 0), coalesce(_rows, 0), coalesce(_files, 0), coalesce(_bytes, 0));
  delete from public.backup_runs where id not in (select id from public.backup_runs order by created_at desc limit 200);
end $$;

create or replace function public.backup_last()
returns table (created_at timestamptz, source text, tables int, rows bigint, files int, bytes bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.backup_guard();
  return query select r.created_at, r.source, r.tables, r.rows, r.files, r.bytes from public.backup_runs r order by r.created_at desc limit 5;
end $$;

-- ---------------------------------------------------------------- dízimo
-- Contribuições (dízimo/ofertas) só para CEO, Pastor Presidente e quem tem "Ver financeiro".
-- O membro comum deixa de ler as próprias linhas (a leitura geral continua protegida por view_finance).
drop policy if exists "financial own contributions read" on public.financial_transactions;

-- ---------------------------------------------------------------- permissões e agenda
revoke all on function public.trash_guard(), public.trash_label(text, jsonb), public.trash_files(text, jsonb),
  public.trash_remove_batches(bigint[]), public.purge_expired_trash(), public.trg_trash_row(), public.trash_attach_all(),
  public.backup_guard() from public, anon, authenticated;
revoke all on function public.trash_list(text, text, int, int), public.trash_stats(), public.trash_items(bigint), public.trash_restore(bigint),
  public.trash_purge(bigint[]), public.trash_empty(), public.delete_activity_logs(uuid[], timestamptz), public.delete_ticket_removal_log(uuid),
  public.backup_tables(), public.backup_table_page(text, int, int), public.backup_storage_objects(),
  public.backup_record(int, bigint, int, bigint, text), public.backup_last(), public.remove_event_tickets(uuid, uuid[], integer, text)
  from public, anon;
grant execute on function public.trash_list(text, text, int, int), public.trash_stats(), public.trash_items(bigint), public.trash_restore(bigint),
  public.trash_purge(bigint[]), public.trash_empty(), public.delete_activity_logs(uuid[], timestamptz), public.delete_ticket_removal_log(uuid),
  public.backup_tables(), public.backup_table_page(text, int, int), public.backup_storage_objects(),
  public.backup_record(int, bigint, int, bigint, text), public.backup_last(), public.remove_event_tickets(uuid, uuid[], integer, text)
  to authenticated;
grant execute on function public.backup_tables(), public.backup_table_page(text, int, int), public.backup_storage_objects(),
  public.backup_record(int, bigint, int, bigint, text), public.remove_event_tickets(uuid, uuid[], integer, text) to service_role;

-- Limpeza diária da lixeira, se a extensão pg_cron existir no projeto (se não, a tela da lixeira e o gatilho fazem a limpeza).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      begin perform cron.unschedule('aava-purge-trash'); exception when others then null; end;
      perform cron.schedule('aava-purge-trash', '17 3 * * *', 'select public.purge_expired_trash()');
    exception when others then
      raise notice 'pg_cron indisponível (%): a limpeza da lixeira roda ao abrir a tela e de forma oportunista', sqlerrm;
    end;
  end if;
end $$;
