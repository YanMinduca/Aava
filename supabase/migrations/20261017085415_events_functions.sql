create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and current_setting('app.event_visitor', true) = 'on'
     and new.user_id = auth.uid() and new.status = 'visitante' then
    new.approval_status := 'aprovado'; new.registration_number := null; new.church_role_id := null;
    new.ministry := null; new.department := null; new.church_role := null; new.affiliated_on := null;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE'
     and current_setting('app.claiming_member', true) = 'on'
     and old.user_id is null and new.user_id = auth.uid() then
    new.updated_at := now();
    return new;
  end if;
  new.registration_number := nullif(btrim(new.registration_number), '');
  if public.has_permission(auth.uid(), 'approve_member') or public.has_permission(auth.uid(), 'edit_member') or public.has_permission(auth.uid(), 'create_member') then
    if not public.has_permission(auth.uid(), 'manage_departments') then
      if tg_op = 'INSERT' then new.church_role_id := null;
      else new.church_role_id := old.church_role_id; end if;
    end if;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pendente';
    new.status := 'membro';
    new.ministry := null; new.department := null; new.church_role := null; new.church_role_id := null;
    new.affiliated_on := null;
    new.registration_number := null;
  else
    new.approval_status := case when old.approval_status = 'recusado' then 'pendente' else old.approval_status end;
    new.status := old.status;
    new.ministry := old.ministry; new.department := old.department; new.church_role := old.church_role; new.church_role_id := old.church_role_id;
    new.affiliated_on := old.affiliated_on;
    new.registration_number := old.registration_number;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.public_events()
returns table (id uuid, slug text, title text, description text, location text, starts_at timestamptz, ends_at timestamptz,
               registration_opens_at timestamptz, registration_closes_at timestamptz, audience text, payment_enabled boolean,
               min_price numeric, spots_left int, registration_open boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.slug, e.title, e.description, e.location, e.starts_at, e.ends_at, e.registration_opens_at, e.registration_closes_at,
         e.audience, e.payment_enabled,
         (select min(l.price) from public.event_lots l where l.event_id = e.id),
         case when exists (select 1 from public.event_lots l where l.event_id = e.id and l.capacity is null) then null
              else (select coalesce(sum(greatest(l.capacity - public.lot_taken(l.id), 0)), 0)::int from public.event_lots l where l.event_id = e.id) end,
         (coalesce(e.registration_opens_at, '-infinity') <= now() and coalesce(e.registration_closes_at, 'infinity') >= now())
  from public.events e
  where e.published and coalesce(e.ends_at, e.starts_at) >= now() - interval '1 day'
  order by e.starts_at;
$$;

create or replace function public.public_event(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'event', to_jsonb(e) - 'created_by',
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'price', l.price, 'capacity', l.capacity,
        'spots_left', case when l.capacity is null then null else greatest(l.capacity - public.lot_taken(l.id), 0) end,
        'public_access', l.public_access, 'opens_at', l.opens_at, 'closes_at', l.closes_at) order by l.position, l.created_at)
      from public.event_lots l where l.event_id = e.id), '[]'::jsonb))
  from public.events e where e.published and lower(e.slug) = lower(_slug);
$$;

create or replace function public.ensure_visitor_profile(_name text, _cpf text, _phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mid uuid; d text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
begin
  if uid is null then raise exception 'login_required'; end if;
  select id into mid from public.members where user_id = uid;
  if mid is not null then return mid; end if;
  if coalesce(array_length(string_to_array(btrim(coalesce(_name, '')), ' '), 1), 0) < 2 then raise exception 'invalid_name'; end if;
  if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
  if btrim(coalesce(_phone, '')) = '' then raise exception 'invalid_phone'; end if;
  if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d and m.user_id is null) then
    raise exception 'cpf_belongs_to_member';
  end if;
  if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d) then
    raise exception 'cpf_in_use';
  end if;
  perform set_config('app.event_visitor', 'on', true);
  insert into public.members (full_name, cpf, phone, email, status, approval_status, user_id)
  values (btrim(_name), substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2), btrim(_phone),
          (select u.email from auth.users u where u.id = uid), 'visitante', 'aprovado', uid)
  returning id into mid;
  perform set_config('app.event_visitor', 'off', true);
  return mid;
end $$;

create or replace function public.issue_event_tickets(_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.event_registrations%rowtype; i int;
begin
  select * into r from public.event_registrations where id = _reg;
  if not found then return; end if;
  if exists (select 1 from public.event_tickets where registration_id = _reg) then return; end if;
  for i in 1..r.quantity loop
    insert into public.event_tickets (registration_id, event_id, seq, code, holder_name)
    values (_reg, r.event_id, i, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
            case when i = 1 then r.attendee_name else r.attendee_name || ' (' || i || ')' end);
  end loop;
end $$;

create or replace function public.refresh_event_registration(_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.event_registrations where id = _reg and status = 'pending')
     and not exists (select 1 from public.event_payments where registration_id = _reg and status <> 'paid') then
    update public.event_registrations set status = 'confirmed' where id = _reg;
    perform public.issue_event_tickets(_reg);
  end if;
end $$;

create or replace function public.register_for_event(_event uuid, _lot uuid, _quantity int, _cpf text, _installments int default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ev public.events%rowtype; lt public.event_lots%rowtype; m public.members%rowtype;
  is_member boolean; d text; used int; total numeric; reg uuid; pay_required boolean; n int; base numeric; i int;
begin
  if uid is null then raise exception 'login_required'; end if;
  select * into ev from public.events where id = _event and published;
  if not found then raise exception 'event_not_found'; end if;
  if now() < coalesce(ev.registration_opens_at, '-infinity') or now() > coalesce(ev.registration_closes_at, 'infinity') then
    raise exception 'registration_closed';
  end if;
  select * into lt from public.event_lots where id = _lot and event_id = _event for update;
  if not found then raise exception 'lot_not_found'; end if;
  if (lt.opens_at is not null and now() < lt.opens_at) or (lt.closes_at is not null and now() > lt.closes_at) then
    raise exception 'lot_closed';
  end if;
  select * into m from public.members where user_id = uid;
  if not found then raise exception 'profile_required'; end if;
  is_member := m.approval_status = 'aprovado' and m.status <> 'visitante';
  if ev.audience = 'members' and not is_member and not lt.public_access then raise exception 'members_only'; end if;
  if _quantity is null or _quantity < 1 or _quantity > 10 then raise exception 'invalid_quantity'; end if;

  d := regexp_replace(coalesce(nullif(btrim(_cpf), ''), m.cpf, ''), '\D', '', 'g');
  if ev.limit_per_person then
    if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
    select coalesce(sum(r.quantity), 0) into used from public.event_registrations r
      where r.event_id = _event and r.status <> 'cancelled'
        and (r.user_id = uid or regexp_replace(coalesce(r.attendee_cpf, ''), '\D', '', 'g') = d);
    if used + _quantity > coalesce(ev.max_per_person, 1) then raise exception 'limit_exceeded'; end if;
  elsif d <> '' and not public.is_valid_cpf(d) then
    raise exception 'invalid_cpf';
  end if;

  if lt.capacity is not null and public.lot_taken(lt.id) + _quantity > lt.capacity then raise exception 'sold_out'; end if;

  pay_required := ev.payment_enabled and lt.price > 0;
  total := lt.price * _quantity;
  n := case when pay_required and coalesce(_installments, 1) > 1 then _installments else 1 end;
  if n > 1 and (not ev.allow_installments or n > ev.max_installments) then raise exception 'invalid_installments'; end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_phone, attendee_email,
                                          quantity, unit_price, total, installments, status)
  values (_event, _lot, uid, m.id, m.full_name, nullif(d, ''), m.phone, coalesce(m.email, (select u.email from auth.users u where u.id = uid)),
          _quantity, lt.price, total, n, case when pay_required then 'pending' else 'confirmed' end)
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
end $$;

create or replace function public.claim_event_payment(_payment uuid, _proof_path text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.event_payments%rowtype; r public.event_registrations%rowtype;
begin
  if uid is null then raise exception 'login_required'; end if;
  select * into p from public.event_payments where id = _payment;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.event_registrations where id = p.registration_id;
  if r.user_id <> uid then raise exception 'Acesso negado'; end if;
  if r.status <> 'pending' or p.status = 'paid' then raise exception 'payment_closed'; end if;
  if _proof_path is not null and _proof_path not like uid::text || '/%' then raise exception 'invalid_proof'; end if;
  update public.event_payments
     set status = 'claimed', claimed_at = coalesce(claimed_at, now()), proof_path = coalesce(_proof_path, proof_path)
   where id = _payment;
end $$;

create or replace function public.set_event_payment_status(_payment uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.event_payments%rowtype; r public.event_registrations%rowtype;
begin
  if not (public.has_permission(auth.uid(), 'verify_event_payments') or public.has_permission(auth.uid(), 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  if _status not in ('pending', 'paid') then raise exception 'invalid_status'; end if;
  select * into p from public.event_payments where id = _payment;
  if not found then raise exception 'not_found'; end if;
  select * into r from public.event_registrations where id = p.registration_id;
  if r.status = 'cancelled' then raise exception 'registration_cancelled'; end if;
  if _status = 'pending' and r.status = 'confirmed' then raise exception 'registration_already_confirmed'; end if;
  update public.event_payments
     set status = _status,
         confirmed_by = case when _status = 'paid' then auth.uid() else null end,
         confirmed_at = case when _status = 'paid' then now() else null end,
         claimed_at = case when _status = 'pending' then null else claimed_at end
   where id = _payment;
  if _status = 'paid' then perform public.refresh_event_registration(p.registration_id); end if;
end $$;

create or replace function public.release_event_registration(_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission(auth.uid(), 'verify_event_payments') or public.has_permission(auth.uid(), 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  update public.event_registrations
     set status = 'confirmed', released_manually = true, released_by = auth.uid(), released_at = now()
   where id = _reg and status = 'pending';
  if not found then raise exception 'not_pending'; end if;
  perform public.issue_event_tickets(_reg);
end $$;

create or replace function public.cancel_event_registration(_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.event_registrations%rowtype; staff boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
  select * into r from public.event_registrations where id = _reg;
  if not found then raise exception 'not_found'; end if;
  staff := public.has_permission(uid, 'verify_event_payments') or public.has_permission(uid, 'manage_events');
  if not staff then
    if r.user_id <> uid then raise exception 'Acesso negado'; end if;
    if r.status <> 'pending' or exists (select 1 from public.event_payments p where p.registration_id = _reg and p.status in ('claimed', 'paid')) then
      raise exception 'cannot_cancel';
    end if;
  end if;
  if r.status = 'cancelled' then return; end if;
  update public.event_registrations set status = 'cancelled', cancelled_at = now() where id = _reg;
  update public.event_tickets set status = 'cancelled' where registration_id = _reg;
end $$;

create or replace function public.checkin_ticket(_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t public.event_tickets%rowtype; ev_title text; r public.event_registrations%rowtype; lot_name text;
begin
  if not (public.has_permission(auth.uid(), 'checkin_events') or public.has_permission(auth.uid(), 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  select * into t from public.event_tickets where code = btrim(coalesce(_code, ''));
  if not found then return jsonb_build_object('result', 'invalid'); end if;
  select title into ev_title from public.events where id = t.event_id;
  select * into r from public.event_registrations where id = t.registration_id;
  select name into lot_name from public.event_lots where id = r.lot_id;
  if t.status = 'cancelled' or r.status <> 'confirmed' then
    return jsonb_build_object('result', 'cancelled', 'holder_name', t.holder_name, 'event_title', ev_title);
  end if;
  if t.status = 'checked_in' then
    return jsonb_build_object('result', 'already', 'holder_name', t.holder_name, 'event_title', ev_title, 'lot', lot_name, 'checked_in_at', t.checked_in_at);
  end if;
  update public.event_tickets set status = 'checked_in', checked_in_at = now(), checked_in_by = auth.uid() where id = t.id;
  return jsonb_build_object('result', 'ok', 'holder_name', t.holder_name, 'event_title', ev_title, 'lot', lot_name, 'ticket_id', t.id);
end $$;

create or replace function public.set_ticket_presence(_ticket uuid, _present boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_permission(auth.uid(), 'checkin_events') or public.has_permission(auth.uid(), 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  update public.event_tickets
     set status = case when _present then 'checked_in' else 'valid' end,
         checked_in_at = case when _present then now() else null end,
         checked_in_by = case when _present then auth.uid() else null end
   where id = _ticket and status <> 'cancelled';
end $$;

create or replace function public.event_admin_stats(_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.has_any_event_permission(auth.uid()) then raise exception 'Acesso negado'; end if;
  select jsonb_build_object(
    'registrations', (select count(*) from public.event_registrations where event_id = _event and status <> 'cancelled'),
    'tickets_total', (select count(*) from public.event_tickets where event_id = _event and status <> 'cancelled'),
    'checked_in', (select count(*) from public.event_tickets where event_id = _event and status = 'checked_in'),
    'expected_total', (select coalesce(sum(r.total), 0) from public.event_registrations r
                         where r.event_id = _event and r.status <> 'cancelled' and exists (select 1 from public.event_payments p where p.registration_id = r.id)),
    'paid_total', (select coalesce(sum(p.amount), 0) from public.event_payments p
                     join public.event_registrations r on r.id = p.registration_id
                     where r.event_id = _event and r.status <> 'cancelled' and p.status = 'paid'),
    'claimed_total', (select coalesce(sum(p.amount), 0) from public.event_payments p
                        join public.event_registrations r on r.id = p.registration_id
                        where r.event_id = _event and r.status <> 'cancelled' and p.status = 'claimed'),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'capacity', l.capacity, 'sold', public.lot_taken(l.id)) order by l.position, l.created_at)
                        from public.event_lots l where l.event_id = _event), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke all on function public.public_events(), public.public_event(text) from public;
grant execute on function public.public_events(), public.public_event(text) to anon, authenticated;
revoke all on function
  public.ensure_visitor_profile(text, text, text), public.register_for_event(uuid, uuid, int, text, int),
  public.claim_event_payment(uuid, text), public.set_event_payment_status(uuid, text), public.release_event_registration(uuid),
  public.cancel_event_registration(uuid), public.checkin_ticket(text), public.set_ticket_presence(uuid, boolean),
  public.event_admin_stats(uuid), public.has_any_event_permission(uuid), public.lot_taken(uuid),
  public.issue_event_tickets(uuid), public.refresh_event_registration(uuid), public.is_valid_cpf(text)
  from public, anon;
grant execute on function
  public.ensure_visitor_profile(text, text, text), public.register_for_event(uuid, uuid, int, text, int),
  public.claim_event_payment(uuid, text), public.set_event_payment_status(uuid, text), public.release_event_registration(uuid),
  public.cancel_event_registration(uuid), public.checkin_ticket(text), public.set_ticket_presence(uuid, boolean),
  public.event_admin_stats(uuid), public.has_any_event_permission(uuid), public.is_valid_cpf(text)
  to authenticated;
revoke all on function public.issue_event_tickets(uuid), public.refresh_event_registration(uuid), public.lot_taken(uuid) from authenticated;
