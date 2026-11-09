-- Inscrição de filho(a) em eventos.
-- Já aplicada no projeto Aava do Supabase em 09/11/2026 (versão 20261109205252). Este arquivo serve só para manter
-- o repositório em sincronia com o histórico remoto. Não precisa rodar de novo (é idempotente, mas as funções já estão no banco).
--
-- A criança ocupa uma vaga/ingresso próprio (mesmo lote, preço e fluxo de pagamento), com ingresso e QR code em
-- nome da criança, ligada ao responsável (user_id/member_id do responsável).

alter table public.events
  add column if not exists allow_child_registration boolean not null default false,
  add column if not exists child_registration_notice text;

alter table public.event_registrations
  add column if not exists is_child boolean not null default false,
  add column if not exists child_age integer,
  add column if not exists guardian_name text;

alter table public.event_registrations drop constraint if exists event_registrations_child_age_check;
alter table public.event_registrations add constraint event_registrations_child_age_check
  check ((is_child and child_age between 0 and 13) or (not is_child and child_age is null));

-- Uma mesma criança (CPF) não pode ter duas inscrições ativas no mesmo evento.
create unique index if not exists event_registrations_child_cpf_key
  on public.event_registrations (event_id, attendee_cpf)
  where is_child and status <> 'cancelled';

-- Inscrição de filho(a): o responsável precisa estar logado e com cadastro (membro ou visitante).
create or replace function public.register_child_for_event(
  _event uuid, _lot uuid, _child_name text, _child_cpf text, _child_age integer,
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
  is_member boolean; d text; gd text; v_name text; total numeric; reg uuid; pay_required boolean;
  n int; base numeric; i int; consent boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
  select * into ev from public.events where id = _event and published;
  if not found then raise exception 'event_not_found'; end if;
  if not ev.allow_child_registration then raise exception 'child_registration_disabled'; end if;
  if now() < coalesce(ev.registration_opens_at, '-infinity') or now() > coalesce(ev.registration_closes_at, 'infinity') then
    raise exception 'registration_closed';
  end if;
  -- O responsável autoriza o uso de imagem da criança quando o evento exige
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

  v_name := regexp_replace(btrim(coalesce(_child_name, '')), '\s+', ' ', 'g');
  if coalesce(array_length(string_to_array(v_name, ' '), 1), 0) < 2 or length(v_name) > 120 then
    raise exception 'invalid_child_name';
  end if;
  if _child_age is null or _child_age < 0 or _child_age > 13 then raise exception 'invalid_child_age'; end if;
  d := regexp_replace(coalesce(_child_cpf, ''), '\D', '', 'g');
  if not public.is_valid_cpf(d) then raise exception 'invalid_child_cpf'; end if;
  gd := regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g');
  if gd <> '' and d = gd then raise exception 'child_cpf_same_as_guardian'; end if;
  if exists (select 1 from public.event_registrations r
              where r.event_id = _event and r.is_child and r.status <> 'cancelled' and r.attendee_cpf = d) then
    raise exception 'child_already_registered';
  end if;

  if lt.capacity is not null and public.lot_taken(lt.id) + 1 > lt.capacity then raise exception 'sold_out'; end if;

  pay_required := ev.payment_enabled and lt.price > 0;
  total := lt.price;
  n := case when pay_required and coalesce(_installments, 1) > 1 then _installments else 1 end;
  if n > 1 and (not ev.allow_installments or n > ev.max_installments) then raise exception 'invalid_installments'; end if;

  insert into public.event_registrations (event_id, lot_id, user_id, member_id, attendee_name, attendee_cpf, attendee_phone, attendee_email,
                                          quantity, unit_price, total, installments, status, image_consent, image_consent_at,
                                          is_child, child_age, guardian_name)
  values (_event, _lot, uid, m.id, v_name, d, m.phone, coalesce(m.email, (select u.email from auth.users u where u.id = uid)),
          1, lt.price, total, n, case when pay_required then 'pending' else 'confirmed' end,
          consent, case when consent then now() end,
          true, _child_age, m.full_name)
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

revoke all on function public.register_child_for_event(uuid, uuid, text, text, integer, integer, boolean) from public, anon;
grant execute on function public.register_child_for_event(uuid, uuid, text, text, integer, integer, boolean) to authenticated, service_role;

-- O limite de inscrições por pessoa continua valendo só para as inscrições do próprio adulto:
-- as vagas dos filhos não entram na conta (cada criança tem CPF próprio e ocupa vaga do lote).
create or replace function public.register_for_event(
  _event uuid, _lot uuid, _quantity integer, _cpf text,
  _installments integer default 1, _image_consent boolean default false,
  _institution text default null, _religion text default null
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
  -- Questionário só para visitantes; membros ficam resumidos como "Membro da igreja"
  if is_member then
    v_institution := 'Membro da igreja';
    v_religion := 'membro_igreja';
  else
    if nullif(btrim(coalesce(_institution, '')), '') is null or length(btrim(_institution)) > 120 then raise exception 'invalid_institution'; end if;
    if _religion is null or _religion not in ('evangelico', 'catolico', 'espirita', 'matriz_africana', 'outros') then raise exception 'invalid_religion'; end if;
    v_institution := btrim(_institution);
    v_religion := _religion;
  end if;
  if ev.audience = 'members' and not is_member and not lt.public_access then raise exception 'members_only'; end if;
  if _quantity is null or _quantity < 1 or _quantity > 10 then raise exception 'invalid_quantity'; end if;

  d := regexp_replace(coalesce(nullif(btrim(_cpf), ''), m.cpf, ''), '\D', '', 'g');
  if ev.limit_per_person then
    if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
    select coalesce(sum(r.quantity), 0) into used from public.event_registrations r
      where r.event_id = _event and r.status <> 'cancelled' and not r.is_child
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
                                          attendee_institution, attendee_religion, quantity, unit_price, total, installments, status, image_consent, image_consent_at)
  values (_event, _lot, uid, m.id, m.full_name, nullif(d, ''), m.phone, coalesce(m.email, (select u.email from auth.users u where u.id = uid)),
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

revoke all on function public.register_for_event(uuid, uuid, integer, text, integer, boolean, text, text) from public, anon;
grant execute on function public.register_for_event(uuid, uuid, integer, text, integer, boolean, text, text) to authenticated, service_role;
