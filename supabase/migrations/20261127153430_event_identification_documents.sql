-- Tipo de identificação nos eventos: quem não tem CPF pode usar RG, CNH, passaporte ou outro documento.
-- Vale para a inscrição feita pela própria pessoa (register_for_event + ensure_visitor_profile) e para o ingresso
-- criado pelo adm em "Convites" (create_event_invite).
--
-- Como funciona:
--  * event_registrations ganha attendee_doc_type (cpf, rg, cnh, passaporte, outro) e attendee_doc_number
--    (número normalizado: só dígitos para CPF; letras maiúsculas e dígitos para os demais).
--  * attendee_cpf continua sendo preenchido SÓ quando o tipo é CPF, então tudo que já usa CPF (limite por pessoa,
--    duplicidade, relatórios antigos) segue igual. Inscrições antigas viram tipo "cpf" automaticamente.
--  * members ganha id_doc_type/id_doc_number, usados só por visitantes que se cadastram pelo evento sem CPF.
--    Quando o tipo é RG, o número também vai para members.rg (a checagem de duplicados por RG continua valendo).
--  * As funções mantêm as assinaturas antigas funcionando (parâmetros novos têm valor padrão).
-- Idempotente.

alter table public.event_registrations
  add column if not exists attendee_doc_type text not null default 'cpf',
  add column if not exists attendee_doc_number text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_doc_type_check') then
    alter table public.event_registrations
      add constraint event_registrations_doc_type_check
      check (attendee_doc_type in ('cpf', 'rg', 'cnh', 'passaporte', 'outro'));
  end if;
end $$;

update public.event_registrations
   set attendee_doc_number = nullif(regexp_replace(attendee_cpf, '\D', '', 'g'), '')
 where attendee_cpf is not null and attendee_doc_number is null;

-- Convite sem CPF: a mesma pessoa (mesmo tipo + número) não recebe dois convites ativos no mesmo evento.
create unique index if not exists event_registrations_invite_doc_key
  on public.event_registrations (event_id, attendee_doc_type, attendee_doc_number)
  where is_invite and status <> 'cancelled' and attendee_doc_type <> 'cpf' and attendee_doc_number is not null;

alter table public.members
  add column if not exists id_doc_type text,
  add column if not exists id_doc_number text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_id_doc_type_check') then
    alter table public.members
      add constraint members_id_doc_type_check
      check (id_doc_type is null or id_doc_type in ('rg', 'cnh', 'passaporte', 'outro'));
  end if;
end $$;

create unique index if not exists members_id_doc_key
  on public.members (id_doc_type, id_doc_number)
  where id_doc_type is not null and id_doc_number is not null;

-- ---------------------------------------------------------------------------------------------------------------
-- Ajudantes: normalizar e validar o documento.
-- CPF: dígitos verificadores. Demais: 5 a 20 letras/números, sem ser tudo o mesmo caractere (ex.: 00000).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.normalize_event_document(_type text, _number text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case when lower(coalesce(nullif(btrim(_type), ''), 'cpf')) = 'cpf'
              then regexp_replace(coalesce(_number, ''), '\D', '', 'g')
              else upper(regexp_replace(coalesce(_number, ''), '[^A-Za-z0-9]', '', 'g')) end
$function$;

create or replace function public.is_valid_event_document(_type text, _number text)
returns boolean
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  t text := lower(coalesce(nullif(btrim(_type), ''), 'cpf'));
  n text;
begin
  if t = 'cpf' then return public.is_valid_cpf(public.normalize_event_document(t, _number)); end if;
  if t not in ('rg', 'cnh', 'passaporte', 'outro') then return false; end if;
  n := public.normalize_event_document(t, _number);
  if char_length(n) < 5 or char_length(n) > 20 then return false; end if;
  if n ~ '^(.)\1+$' then return false; end if;
  return true;
end $function$;

revoke all on function public.normalize_event_document(text, text) from public, anon;
revoke all on function public.is_valid_event_document(text, text) from public, anon;
grant execute on function public.normalize_event_document(text, text) to authenticated, service_role;
grant execute on function public.is_valid_event_document(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Visitante que se cadastra pelo evento: agora pode informar RG, CNH, passaporte ou outro documento no lugar do CPF.
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.ensure_visitor_profile(text, text, text, date);

create or replace function public.ensure_visitor_profile(
  _name text, _cpf text, _phone text, _birth_date date default null,
  _id_type text default 'cpf', _id_number text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  mid uuid;
  v_type text := lower(coalesce(nullif(btrim(_id_type), ''), 'cpf'));
  v_raw text;
  d text;
  v_doc text;
begin
  if uid is null then raise exception 'login_required'; end if;
  select id into mid from public.members where user_id = uid;
  if mid is not null then return mid; end if;
  if coalesce(array_length(string_to_array(btrim(coalesce(_name, '')), ' '), 1), 0) < 2 then raise exception 'invalid_name'; end if;
  if v_type not in ('cpf', 'rg', 'cnh', 'passaporte', 'outro') then raise exception 'invalid_id_type'; end if;
  if btrim(coalesce(_phone, '')) = '' then raise exception 'invalid_phone'; end if;
  if not public.is_valid_birth_date(_birth_date) then raise exception 'invalid_birth_date'; end if;

  if v_type = 'cpf' then
    v_raw := coalesce(nullif(btrim(_cpf), ''), _id_number, '');
    d := public.normalize_event_document('cpf', v_raw);
    if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
    if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d and m.user_id is null) then
      raise exception 'cpf_belongs_to_member';
    end if;
    if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d) then
      raise exception 'cpf_in_use';
    end if;
    perform set_config('app.event_visitor', 'on', true);
    insert into public.members (full_name, cpf, phone, email, birth_date, status, approval_status, user_id)
    values (btrim(_name), substr(d, 1, 3) || '.' || substr(d, 4, 3) || '.' || substr(d, 7, 3) || '-' || substr(d, 10, 2), btrim(_phone),
            (select u.email from auth.users u where u.id = uid), _birth_date, 'visitante', 'aprovado', uid)
    returning id into mid;
    perform set_config('app.event_visitor', 'off', true);
    return mid;
  end if;

  -- Sem CPF: RG, CNH, passaporte ou outro documento.
  v_raw := coalesce(nullif(btrim(_id_number), ''), nullif(btrim(_cpf), ''), '');
  v_doc := public.normalize_event_document(v_type, v_raw);
  if not public.is_valid_event_document(v_type, v_doc) then raise exception 'invalid_document'; end if;
  if exists (select 1 from public.members m
              where m.user_id is null
                and ((m.id_doc_type = v_type and m.id_doc_number = v_doc)
                     or (v_type = 'rg' and upper(regexp_replace(coalesce(m.rg, ''), '[^A-Za-z0-9]', '', 'g')) = v_doc))) then
    raise exception 'document_belongs_to_member';
  end if;
  if exists (select 1 from public.members m where m.id_doc_type = v_type and m.id_doc_number = v_doc) then
    raise exception 'document_in_use';
  end if;
  perform set_config('app.event_visitor', 'on', true);
  insert into public.members (full_name, cpf, rg, id_doc_type, id_doc_number, phone, email, birth_date, status, approval_status, user_id)
  values (btrim(_name), null, case when v_type = 'rg' then btrim(v_raw) end, v_type, v_doc, btrim(_phone),
          (select u.email from auth.users u where u.id = uid), _birth_date, 'visitante', 'aprovado', uid)
  returning id into mid;
  perform set_config('app.event_visitor', 'off', true);
  return mid;
end $function$;

revoke all on function public.ensure_visitor_profile(text, text, text, date, text, text) from public, anon;
grant execute on function public.ensure_visitor_profile(text, text, text, date, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Inscrição feita pela própria pessoa. Parâmetros novos: _id_type e _id_number.
-- Tipo "cpf" (padrão) funciona como antes. Outros tipos guardam o documento em attendee_doc_*, sem mexer em attendee_cpf.
-- O documento só é obrigatório quando o evento limita inscrições por pessoa (igual ao CPF).
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.register_for_event(uuid, uuid, integer, text, integer, boolean, text, text);

create or replace function public.register_for_event(
  _event uuid, _lot uuid, _quantity integer, _cpf text,
  _installments integer default 1, _image_consent boolean default false,
  _institution text default null, _religion text default null,
  _id_type text default 'cpf', _id_number text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  ev public.events%rowtype; lt public.event_lots%rowtype; m public.members%rowtype;
  is_member boolean; d text; used int; total numeric; reg uuid; pay_required boolean; n int; base numeric; i int;
  consent boolean; v_institution text; v_religion text;
  v_type text := lower(coalesce(nullif(btrim(_id_type), ''), 'cpf'));
  v_doc text;
begin
  if uid is null then raise exception 'login_required'; end if;
  if v_type not in ('cpf', 'rg', 'cnh', 'passaporte', 'outro') then raise exception 'invalid_id_type'; end if;
  select * into ev from public.events where id = _event and published;
  if not found then raise exception 'event_not_found'; end if;
  if now() < coalesce(ev.registration_opens_at, '-infinity') or now() > coalesce(ev.registration_closes_at, 'infinity') then
    raise exception 'registration_closed';
  end if;
  -- Autorização de uso de imagem: obrigatória quando o evento exige
  consent := ev.require_image_consent and coalesce(_image_consent, false);
  if ev.require_image_consent and not consent then raise exception 'image_consent_required'; end if;

  select * into lt from public.event_lots where id = _lot and event_id = _event for update;
  if not found then raise exception 'lot_not_found'; end if;
  if (lt.opens_at is not null and now() < lt.opens_at) or (lt.closes_at is not null and now() > lt.closes_at) then
    raise exception 'lot_closed';
  end if;
  select * into m from public.members where user_id = uid;
  if not found then raise exception 'profile_required'; end if;
  is_member := m.approval_status = 'aprovado' and m.status <> 'visitante';
  -- Questionário só para visitantes; membros ficam resumidos como "Membro da igreja".
  -- A religião só é pedida (e guardada) quando o evento está com "pedir religião" ligado.
  if is_member then
    v_institution := 'Membro da igreja';
    v_religion := 'membro_igreja';
  else
    if nullif(btrim(coalesce(_institution, '')), '') is null or length(btrim(_institution)) > 120 then raise exception 'invalid_institution'; end if;
    v_institution := btrim(_institution);
    if ev.ask_religion then
      if _religion is null or _religion not in ('evangelico', 'catolico', 'espirita', 'matriz_africana', 'outros') then raise exception 'invalid_religion'; end if;
      v_religion := _religion;
    else
      v_religion := null;
    end if;
  end if;
  if ev.audience = 'members' and not is_member and not lt.public_access then raise exception 'members_only'; end if;
  if _quantity is null or _quantity < 1 or _quantity > 10 then raise exception 'invalid_quantity'; end if;

  if v_type = 'cpf' then
    d := regexp_replace(coalesce(nullif(btrim(_cpf), ''), nullif(btrim(_id_number), ''), m.cpf, ''), '\D', '', 'g');
    v_doc := nullif(d, '');
    if ev.limit_per_person then
      if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
      select coalesce(sum(r.quantity), 0) into used from public.event_registrations r
        where r.event_id = _event and r.status <> 'cancelled' and not r.is_child
          and (r.user_id = uid or regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g') = d);
      if used + _quantity > coalesce(ev.max_per_person, 1) then raise exception 'limit_exceeded'; end if;
    elsif d <> '' and not public.is_valid_cpf(d) then
      raise exception 'invalid_cpf';
    end if;
  else
    -- Sem CPF: o número vem em _id_number (ou em _cpf, por compatibilidade).
    d := '';
    v_doc := public.normalize_event_document(v_type, coalesce(nullif(btrim(_id_number), ''), nullif(btrim(_cpf), ''), ''));
    if ev.limit_per_person then
      if not public.is_valid_event_document(v_type, v_doc) then raise exception 'invalid_document'; end if;
      select coalesce(sum(r.quantity), 0) into used from public.event_registrations r
        where r.event_id = _event and r.status <> 'cancelled' and not r.is_child
          and (r.user_id = uid or (r.attendee_doc_type = v_type and r.attendee_doc_number = v_doc));
      if used + _quantity > coalesce(ev.max_per_person, 1) then raise exception 'limit_exceeded'; end if;
    elsif v_doc <> '' and not public.is_valid_event_document(v_type, v_doc) then
      raise exception 'invalid_document';
    end if;
    v_doc := nullif(v_doc, '');
  end if;

  if lt.capacity is not null and public.lot_taken(lt.id) + _quantity > lt.capacity then raise exception 'sold_out'; end if;

  pay_required := ev.payment_enabled and lt.price > 0;
  total := lt.price * _quantity;
  n := case when pay_required and coalesce(_installments, 1) > 1 then _installments else 1 end;
  if n > 1 and (not ev.allow_installments or n > ev.max_installments) then raise exception 'invalid_installments'; end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_doc_type, attendee_doc_number,
                                          attendee_phone, attendee_email, attendee_institution, attendee_religion, quantity, unit_price, total,
                                          installments, status, image_consent, image_consent_at)
  values (_event, _lot, uid, m.id, m.full_name, nullif(d, ''), v_type, v_doc,
          m.phone, coalesce(m.email, (select u.email from auth.users u where u.id = uid)),
          v_institution, v_religion, _quantity, lt.price, total, n, case when pay_required then 'pending' else 'confirmed' end,
          consent, case when consent then now() end)
  returning id into reg;

  if pay_required then
    base := round(total / n, 2);
    for i in 1..n loop
      insert into public.event_payments (registration_id, installment_no, amount)
      values (reg, i, case when i = n then total - base * (n - 1) else base end);
    end loop;
  else
    perform public.issue_event_tickets(reg);
  end if;
  return reg;
end $function$;

revoke all on function public.register_for_event(uuid, uuid, integer, text, integer, boolean, text, text, text, text) from public, anon;
grant execute on function public.register_for_event(uuid, uuid, integer, text, integer, boolean, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Ingresso criado pelo adm (convite). Parâmetros novos: _id_type e _id_number.
-- Tipo "cpf" (padrão) funciona como antes. Outros tipos exigem _id_number válido e não gravam attendee_cpf.
-- ---------------------------------------------------------------------------------------------------------------
drop function if exists public.create_event_invite(uuid, uuid, text, date, text, text, text, text, uuid);

create or replace function public.create_event_invite(
  _event uuid, _lot uuid, _name text, _birth_date date, _cpf text, _phone text,
  _religion text default null, _institution text default null, _user uuid default null,
  _id_type text default 'cpf', _id_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g');
  v_type text := lower(coalesce(nullif(btrim(_id_type), ''), 'cpf'));
  d text;
  v_doc text;
  v_phone text := btrim(coalesce(_phone, ''));
  phone_digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
  v_religion text;
  v_institution text;
  ev public.events%rowtype;
  lt public.event_lots%rowtype;
  reg uuid;
  t public.event_tickets%rowtype;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'manage_events')
          or public.has_permission(uid, 'verify_event_payments')
          or public.has_permission(uid, 'issue_event_invites')) then
    raise exception 'Acesso negado';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 120 then raise exception 'invalid_invite_name'; end if;
  if _birth_date is null or _birth_date > current_date or _birth_date < date '1900-01-01' then
    raise exception 'invalid_birth_date';
  end if;
  if v_type not in ('cpf', 'rg', 'cnh', 'passaporte', 'outro') then raise exception 'invalid_id_type'; end if;
  if v_type = 'cpf' then
    d := public.normalize_event_document('cpf', coalesce(nullif(btrim(_cpf), ''), _id_number, ''));
    if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
    v_doc := d;
  else
    d := null;
    v_doc := public.normalize_event_document(v_type, coalesce(nullif(btrim(_id_number), ''), nullif(btrim(_cpf), ''), ''));
    if not public.is_valid_event_document(v_type, v_doc) then raise exception 'invalid_document'; end if;
  end if;
  if char_length(phone_digits) < 10 or char_length(phone_digits) > 13 then raise exception 'invalid_phone'; end if;

  -- Conta vinculada (opcional): precisa ser uma conta que existe e tem cadastro.
  if _user is not null and not exists (select 1 from public.members m where m.user_id = _user) then
    raise exception 'account_not_found';
  end if;

  select * into ev from public.events where id = _event;
  if not found then raise exception 'event_not_found'; end if;

  if ev.ask_religion then
    if _religion is null or _religion not in ('evangelico', 'catolico', 'espirita', 'matriz_africana', 'outros') then
      raise exception 'invalid_religion';
    end if;
    v_institution := btrim(coalesce(_institution, ''));
    if v_institution = '' or char_length(v_institution) > 120 then raise exception 'invalid_institution'; end if;
    v_religion := _religion;
  else
    v_religion := null;
    v_institution := null;
  end if;

  select * into lt from public.event_lots where id = _lot and event_id = _event for update;
  if not found then raise exception 'lot_not_found'; end if;
  if lt.capacity is not null and public.lot_taken(lt.id) + 1 > lt.capacity then raise exception 'sold_out'; end if;

  if v_type = 'cpf' then
    if exists (select 1 from public.event_registrations r
                where r.event_id = _event and r.status <> 'cancelled'
                  and regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g') = d) then
      raise exception 'invite_cpf_already_registered';
    end if;
  else
    if exists (select 1 from public.event_registrations r
                where r.event_id = _event and r.status <> 'cancelled'
                  and r.attendee_doc_type = v_type and r.attendee_doc_number = v_doc) then
      raise exception 'invite_document_already_registered';
    end if;
  end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_doc_type, attendee_doc_number,
                                          attendee_birth_date, attendee_phone, attendee_religion, attendee_institution,
                                          quantity, unit_price, total, installments, status, is_invite, invited_by, account_linked)
  values (_event, _lot, coalesce(_user, uid), null, v_name, d, v_type, v_doc,
          _birth_date, v_phone, v_religion, v_institution,
          1, 0, 0, 1, 'confirmed', true, uid, _user is not null)
  returning id into reg;

  perform public.issue_event_tickets(reg);
  select * into t from public.event_tickets where registration_id = reg order by seq limit 1;

  return jsonb_build_object('registration_id', reg, 'ticket_id', t.id, 'code', t.code,
                            'short_code', t.short_code, 'holder_name', t.holder_name);
end $function$;

revoke all on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text, uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Lista de convites: devolve também o tipo do documento e os 2 últimos caracteres (cpf_end só vem para CPF).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.list_event_invites(_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'manage_events')
          or public.has_permission(uid, 'verify_event_payments')
          or public.has_permission(uid, 'issue_event_invites')) then
    raise exception 'Acesso negado';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'registration_id', r.id, 'ticket_id', t.id, 'code', t.code, 'short_code', t.short_code,
      'holder_name', r.attendee_name,
      'cpf_end', case when r.attendee_doc_type = 'cpf'
                      then right(regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g'), 2) else '' end,
      'doc_type', r.attendee_doc_type,
      'doc_end', right(coalesce(r.attendee_doc_number, ''), 2),
      'birth_date', r.attendee_birth_date, 'phone', r.attendee_phone,
      'religion', r.attendee_religion, 'institution', r.attendee_institution,
      'linked_name', case when r.account_linked then (select m.full_name from public.members m where m.user_id = r.user_id limit 1) end,
      'lot', l.name, 'registration_status', r.status,
      'ticket_status', t.status, 'created_at', r.created_at, 'created_by_me', r.invited_by = uid)
      order by r.created_at desc)
    from public.event_registrations r
    join public.event_lots l on l.id = r.lot_id
    left join public.event_tickets t on t.registration_id = r.id and t.seq = 1
    where r.event_id = _event and r.is_invite), '[]'::jsonb);
end $function$;