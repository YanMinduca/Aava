-- Ingresso criado manualmente pela liderança (convite): para quem não tem e-mail/conta e pediu um convite.
-- Pede nome, data de nascimento e CPF; gera 1 ingresso válido com QR code em nome do convidado.
--
-- Quem pode criar: CEO, Pastor Presidente (têm todas as permissões), quem tem "manage_events" ou "verify_event_payments"
-- e quem receber a nova permissão "issue_event_invites" em Usuários e permissões.
-- O convite ocupa 1 vaga do lote escolhido (respeita a capacidade) e não gera cobrança (valor 0).
-- A inscrição fica registrada em nome de quem criou (user_id) com is_invite = true, e não aparece em "Meus ingressos"
-- de quem criou. Na lista de inscrições do evento ela aparece com a etiqueta "Convite".
-- Idempotente.

alter table public.event_registrations
  add column if not exists is_invite boolean not null default false,
  add column if not exists invited_by uuid;

-- Mesma pessoa (CPF) não recebe dois convites/inscrições ativas no mesmo evento.
create unique index if not exists event_registrations_invite_cpf_key
  on public.event_registrations (event_id, attendee_cpf)
  where is_invite and status <> 'cancelled';

create or replace function public.create_event_invite(
  _event uuid, _lot uuid, _name text, _birth_date date, _cpf text
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
  if not exists (select 1 from public.events where id = _event) then raise exception 'event_not_found'; end if;

  select * into lt from public.event_lots where id = _lot and event_id = _event for update;
  if not found then raise exception 'lot_not_found'; end if;
  if lt.capacity is not null and public.lot_taken(lt.id) + 1 > lt.capacity then raise exception 'sold_out'; end if;

  if exists (select 1 from public.event_registrations r
              where r.event_id = _event and r.status <> 'cancelled'
                and regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g') = d) then
    raise exception 'invite_cpf_already_registered';
  end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_birth_date,
                                          quantity, unit_price, total, installments, status, is_invite, invited_by)
  values (_event, _lot, uid, null, v_name, d, _birth_date, 1, 0, 0, 1, 'confirmed', true, uid)
  returning id into reg;

  perform public.issue_event_tickets(reg);
  select * into t from public.event_tickets where registration_id = reg order by seq limit 1;

  return jsonb_build_object('registration_id', reg, 'ticket_id', t.id, 'code', t.code,
                            'short_code', t.short_code, 'holder_name', t.holder_name);
end $function$;

revoke all on function public.create_event_invite(uuid, uuid, text, date, text) from public, anon;
grant execute on function public.create_event_invite(uuid, uuid, text, date, text) to authenticated, service_role;

-- Lista os convites do evento para quem pode criá-los (CPF só com os 2 últimos dígitos).
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
      'birth_date', r.attendee_birth_date, 'lot', l.name, 'registration_status', r.status,
      'ticket_status', t.status, 'created_at', r.created_at, 'created_by_me', r.invited_by = uid)
      order by r.created_at desc)
    from public.event_registrations r
    join public.event_lots l on l.id = r.lot_id
    left join public.event_tickets t on t.registration_id = r.id and t.seq = 1
    where r.event_id = _event and r.is_invite), '[]'::jsonb);
end $function$;

revoke all on function public.list_event_invites(uuid) from public, anon;
grant execute on function public.list_event_invites(uuid) to authenticated, service_role;

-- Faz o Supabase (PostgREST) reconhecer as funções novas/alteradas na hora.
notify pgrst, 'reload schema';
