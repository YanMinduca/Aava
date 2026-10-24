-- Autorização de uso de imagem nos eventos.
-- O evento pode exigir "Estou de acordo com meu uso de imagem"; se exigir, a inscrição só é aceita com o aceite.

alter table public.events
  add column if not exists require_image_consent boolean not null default false;

alter table public.event_registrations
  add column if not exists image_consent boolean not null default false,
  add column if not exists image_consent_at timestamptz;

-- A assinatura muda (novo parâmetro), então a versão antiga é removida para não haver duas sobrecargas ambíguas.
drop function if exists public.register_for_event(uuid, uuid, integer, text, integer);

create or replace function public.register_for_event(
  _event uuid, _lot uuid, _quantity integer, _cpf text,
  _installments integer default 1, _image_consent boolean default false
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
  consent boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
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
                                          quantity, unit_price, total, installments, status, image_consent, image_consent_at)
  values (_event, _lot, uid, m.id, m.full_name, nullif(d, ''), m.phone, coalesce(m.email, (select u.email from auth.users u where u.id = uid)),
          _quantity, lt.price, total, n, case when pay_required then 'pending' else 'confirmed' end,
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

revoke all on function public.register_for_event(uuid, uuid, integer, text, integer, boolean) from public, anon;
grant execute on function public.register_for_event(uuid, uuid, integer, text, integer, boolean) to authenticated, service_role;
