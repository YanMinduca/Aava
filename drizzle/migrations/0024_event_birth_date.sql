-- Data de nascimento nas inscrições de eventos.
-- 1) Visitante informa a data ao criar o cadastro (members.birth_date já existe).
-- 2) Cada inscrição guarda uma cópia (attendee_birth_date) para o relatório do evento.
-- 3) Quem já tem cadastro sem data (visitantes antigos) preenche na própria inscrição.

alter table public.event_registrations
  add column if not exists attendee_birth_date date;

-- Validação reutilizável: obrigatória, não pode ser futura nem anterior a 120 anos.
create or replace function public.is_valid_birth_date(_d date)
returns boolean language sql immutable as $$
  select _d is not null and _d <= current_date and _d >= (current_date - interval '120 years')::date;
$$;

-- Assinatura muda (novo parâmetro): remove a antiga para não haver sobrecarga ambígua.
drop function if exists public.ensure_visitor_profile(text, text, text);

create or replace function public.ensure_visitor_profile(_name text, _cpf text, _phone text, _birth_date date default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mid uuid; d text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
begin
  if uid is null then raise exception 'login_required'; end if;
  select id into mid from public.members where user_id = uid;
  if mid is not null then return mid; end if;
  if coalesce(array_length(string_to_array(btrim(coalesce(_name, '')), ' '), 1), 0) < 2 then raise exception 'invalid_name'; end if;
  if not public.is_valid_cpf(d) then raise exception 'invalid_cpf'; end if;
  if btrim(coalesce(_phone, '')) = '' then raise exception 'invalid_phone'; end if;
  if not public.is_valid_birth_date(_birth_date) then raise exception 'invalid_birth_date'; end if;
  if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d and m.user_id is null) then
    raise exception 'cpf_belongs_to_member';
  end if;
  if exists (select 1 from public.members m where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = d) then
    raise exception 'cpf_in_use';
  end if;
  perform set_config('app.event_visitor', 'on', true);
  insert into public.members (full_name, cpf, phone, email, birth_date, status, approval_status, user_id)
  values (btrim(_name), substr(d,1,3)||'.'||substr(d,4,3)||'.'||substr(d,7,3)||'-'||substr(d,10,2), btrim(_phone),
          (select u.email from auth.users u where u.id = uid), _birth_date, 'visitante', 'aprovado', uid)
  returning id into mid;
  perform set_config('app.event_visitor', 'off', true);
  return mid;
end $$;

revoke all on function public.ensure_visitor_profile(text, text, text, date) from public, anon;
grant execute on function public.ensure_visitor_profile(text, text, text, date) to authenticated, service_role;

-- Quem já tem cadastro, mas sem data de nascimento, completa pela inscrição (só preenche se estiver vazia).
create or replace function public.set_my_birth_date(_birth_date date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if not public.is_valid_birth_date(_birth_date) then raise exception 'invalid_birth_date'; end if;
  update public.members set birth_date = _birth_date where user_id = auth.uid() and birth_date is null;
end $$;

revoke all on function public.set_my_birth_date(date) from public, anon;
grant execute on function public.set_my_birth_date(date) to authenticated, service_role;

-- Copia a data do cadastro para a inscrição (evita redefinir register_for_event inteira).
create or replace function public.event_registration_birth_date()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.attendee_birth_date is null and new.member_id is not null then
    select m.birth_date into new.attendee_birth_date from public.members m where m.id = new.member_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_event_registration_birth_date on public.event_registrations;
create trigger trg_event_registration_birth_date
  before insert on public.event_registrations
  for each row execute function public.event_registration_birth_date();

-- Inscrições anteriores: aproveita a data que já estiver no cadastro.
update public.event_registrations r set attendee_birth_date = m.birth_date
  from public.members m where m.id = r.member_id and r.attendee_birth_date is null;
