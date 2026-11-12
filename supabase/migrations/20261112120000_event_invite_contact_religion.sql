-- Convite (ingresso criado pela liderança) passa a pedir também:
--   * Telefone (sempre);
--   * Religião e instituição religiosa — só quando o evento está com "pedir religião" ligado (events.ask_religion).
-- Os valores de religião são os mesmos da inscrição normal: evangelico, catolico, espirita, matriz_africana, outros.
-- Os dados vão para as colunas que a inscrição já usa (attendee_phone, attendee_religion, attendee_institution),
-- então aparecem na lista de inscrições, na exportação XLS e nos gráficos de perfil do público.
-- A assinatura de create_event_invite muda (3 parâmetros novos), então a versão antiga é removida.
-- Idempotente.

drop function if exists public.create_event_invite(uuid, uuid, text, date, text);

create or replace function public.create_event_invite(
  _event uuid, _lot uuid, _name text, _birth_date date, _cpf text, _phone text,
  _religion text default null, _institution text default null
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

  select * into ev from public.events where id = _event;
  if not found then raise exception 'event_not_found'; end if;

  -- Religião e instituição só são pedidas (e guardadas) quando o evento está com "pedir religião" ligado.
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
                                          quantity, unit_price, total, installments, status, is_invite, invited_by)
  values (_event, _lot, uid, null, v_name, d, _birth_date,
          v_phone, v_religion, v_institution,
          1, 0, 0, 1, 'confirmed', true, uid)
  returning id into reg;

  perform public.issue_event_tickets(reg);
  select * into t from public.event_tickets where registration_id = reg order by seq limit 1;

  return jsonb_build_object('registration_id', reg, 'ticket_id', t.id, 'code', t.code,
                            'short_code', t.short_code, 'holder_name', t.holder_name);
end $function$;

revoke all on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text) from public, anon;
grant execute on function public.create_event_invite(uuid, uuid, text, date, text, text, text, text) to authenticated, service_role;

-- A lista de convites passa a devolver telefone, religião e instituição (CPF continua só com os 2 últimos dígitos).
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
