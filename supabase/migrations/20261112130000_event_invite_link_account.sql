-- Convite pode ser vinculado (opcional) a uma conta já cadastrada.
-- Quando vinculado, a inscrição passa a ser da conta escolhida (user_id), então a pessoa vê o ingresso em
-- "Meus ingressos" como quem se inscreveu sozinha (as regras de leitura/remoção já se baseiam em user_id).
-- invited_by continua sendo quem criou o convite. account_linked = true marca que o convite tem dono de conta;
-- sem vínculo, o convite segue escondido de "Meus ingressos" de quem o criou.
-- member_id fica vazio de propósito: os dados do ingresso são os informados pela liderança.
-- Idempotente.

alter table public.event_registrations
  add column if not exists account_linked boolean not null default false;

drop function if exists public.create_event_invite(uuid, uuid, text, date, text, text, text, text);

create or replace function public.create_event_invite(
  _event uuid, _lot uuid, _name text, _birth_date date, _cpf text, _phone text,
  _religion text default null, _institution text default null, _user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_name text := regexp_replace(btrim(coalesce(_name, '')), '\s+', ' ', 'g');
  d text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
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
  if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
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

  if exists (select 1 from public.event_registrations r
              where r.event_id = _event and r.status <> 'cancelled'
                and regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g') = d) then
    raise exception 'invite_cpf_already_registered';
  end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_birth_date,
                                          attendee_phone, attendee_religion, attendee_institution,
                                          quantity, unit_price, total, installments, status, is_invite, invited_by, account_linked)
  values (_event, _lot, coalesce(_user, uid), null, v_name, d, _birth_date,
          v_phone, v_religion, v_institution,
          1, 0, 0, 1, 'confirmed', true, uid, _user is not null)
  returning id into reg;

  perform public.issue_event_tickets(reg);
  select * into t from public.event_tickets where registration_id = reg order by seq limit 1;

  return jsonb_build_object('registration_id', reg, 'ticket_id', t.id, 'code', t.code,
                            'short_code', t.short_code, 'holder_name', t.holder_name);
end $function$;

revoke all on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text, uuid) to authenticated, service_role;

-- Busca de contas já cadastradas para vincular (nome, CPF, telefone ou e-mail). Só quem pode criar convites.
-- Devolve poucos dados: nome, e-mail parcialmente escondido e os 2 últimos dígitos do CPF.
create or replace function public.search_invite_accounts(_q text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  q text := btrim(coalesce(_q, ''));
  qd text := regexp_replace(btrim(coalesce(_q, '')), '\D', '', 'g');
  pat text;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'manage_events')
          or public.has_permission(uid, 'verify_event_payments')
          or public.has_permission(uid, 'issue_event_invites')) then
    raise exception 'Acesso negado';
  end if;
  if char_length(q) < 3 then return '[]'::jsonb; end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'full_name', s.full_name,
      'email', case when s.email is null then null
                    else left(s.email, 2) || '***' || coalesce(substring(s.email from '@.*$'), '') end,
      'cpf_end', right(regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g'), 2)) order by s.full_name)
    from (
      select m.user_id, m.full_name, m.cpf, coalesce(m.email, u.email) as email
        from public.members m
        left join auth.users u on u.id = m.user_id
       where m.user_id is not null
         and (m.full_name ilike pat
              or coalesce(m.email, u.email, '') ilike pat
              or (char_length(qd) >= 4
                  and (regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') like '%' || qd || '%'
                       or regexp_replace(coalesce(m.phone, ''), '\D', '', 'g') like '%' || qd || '%')))
       order by m.full_name
       limit 8) s), '[]'::jsonb);
end $function$;

revoke all on function public.search_invite_accounts(text) from public, anon;
grant execute on function public.search_invite_accounts(text) to authenticated, service_role;

-- A lista de convites passa a dizer a qual conta o ingresso está vinculado.
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
      'holder_name', r.attendee_name, 'cpf_end', right(regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g'), 2),
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

revoke all on function public.list_event_invites(uuid) from public, anon;
grant execute on function public.list_event_invites(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
