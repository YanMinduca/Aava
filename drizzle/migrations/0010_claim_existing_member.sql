-- Vínculo de conta a cadastro já existente (feito pelo pastor), com confirmação por CPF.
-- Pode rodar mais de uma vez.

create or replace function public.norm_name(_s text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(
    lower(translate(btrim(coalesce(_s, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
      'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
    '\s+', ' ', 'g');
$$;

-- Registro de buscas e tentativas (só as funções abaixo leem e gravam aqui)
create table if not exists public.member_claim_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  member_id uuid,
  kind text not null check (kind in ('lookup', 'claim')),
  success boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists member_claim_attempts_user_idx on public.member_claim_attempts (user_id, kind, created_at);
create index if not exists member_claim_attempts_member_idx on public.member_claim_attempts (member_id, created_at) where kind = 'claim';
alter table public.member_claim_attempts enable row level security;
revoke all on public.member_claim_attempts from anon, authenticated;

-- Procura cadastros SEM conta cujo nome (sem acento/maiúscula) é igual ao digitado.
-- Exige nome completo (2+ palavras), devolve no máximo 3 e só id + nome + se tem CPF.
create or replace function public.find_claimable_members(_name text)
returns table (id uuid, full_name text, has_cpf boolean)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n text := public.norm_name(_name);
begin
  if uid is null then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.members m where m.user_id = uid) then return; end if;
  if coalesce(array_length(string_to_array(n, ' '), 1), 0) < 2 then return; end if;
  if (select count(*) from public.member_claim_attempts a
        where a.user_id = uid and a.kind = 'lookup' and a.created_at > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.member_claim_attempts (user_id, kind) values (uid, 'lookup');
  return query
    select m.id, m.full_name, length(regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g')) = 11
    from public.members m
    where m.user_id is null and m.approval_status = 'aprovado' and public.norm_name(m.full_name) = n
    order by m.full_name
    limit 3;
end $$;

-- Vincula a conta de quem está logado ao cadastro, se o CPF conferir.
-- Retorna: ok | wrong_cpf | locked | unavailable | no_cpf | already_linked
create or replace function public.claim_member(_member uuid, _cpf text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  typed text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  real_cpf text;
  fails_user int;
  fails_member int;
begin
  if uid is null then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.members m where m.user_id = uid) then return 'already_linked'; end if;

  select count(*) into fails_user from public.member_claim_attempts a
    where a.user_id = uid and a.kind = 'claim' and not a.success and a.created_at > now() - interval '24 hours';
  select count(*) into fails_member from public.member_claim_attempts a
    where a.member_id = _member and a.kind = 'claim' and not a.success and a.created_at > now() - interval '24 hours';
  if fails_user >= 5 or fails_member >= 5 then return 'locked'; end if;

  select regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') into real_cpf
    from public.members m
    where m.id = _member and m.user_id is null and m.approval_status = 'aprovado'
    for update;
  if not found then return 'unavailable'; end if;
  if length(real_cpf) <> 11 then return 'no_cpf'; end if;

  if typed <> real_cpf then
    insert into public.member_claim_attempts (user_id, member_id, kind, success) values (uid, _member, 'claim', false);
    return 'wrong_cpf';
  end if;

  perform set_config('app.claiming_member', 'on', true);
  update public.members set user_id = uid where id = _member and user_id is null;
  perform set_config('app.claiming_member', 'off', true);
  insert into public.member_claim_attempts (user_id, member_id, kind, success) values (uid, _member, 'claim', true);
  return 'ok';
end $$;

revoke all on function public.find_claimable_members(text), public.claim_member(uuid, text) from public, anon;
grant execute on function public.find_claimable_members(text), public.claim_member(uuid, text) to authenticated;

-- members_guard: libera SOMENTE a troca de user_id (null -> o próprio usuário) feita por claim_member
create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
