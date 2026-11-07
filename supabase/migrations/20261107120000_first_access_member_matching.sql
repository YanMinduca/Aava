-- Primeiro acesso do membro: "Meu cadastro" antes do painel e vínculo da conta ao cadastro que a igreja já tem.
--
-- Só ACRESCENTA funções, uma tabela auxiliar e uma regra de leitura de fotos. Não altera nem apaga dados.
--
-- 1) needs_member_onboarding(): diz se a conta ainda precisa passar por "Meu cadastro" (sem cadastro vinculado
--    e sem nenhum papel além do "member" que toda conta nova recebe, nem permissão de administração).
--    O painel usa isso para abrir "Meu cadastro" primeiro.
-- 2) find_member_matches(cpf, telefone, e-mail, rg): procura cadastros ainda sem conta que batem com o que a
--    pessoa digitou e devolve só o necessário para o pop-up (nome, 2 últimos dígitos do CPF, e-mail, foto).
-- 3) claim_member_match(...): vincula a conta ao cadastro ("Sou eu"). Tudo é conferido de novo no servidor.
--    - CPF digitado igual ao do cadastro, ou e-mail digitado igual ao do cadastro E igual ao e-mail confirmado
--      da própria conta: vincula direto.
--    - Só telefone, só RG ou e-mail diferente do da conta: exige confirmar o CPF do cadastro (telefone e e-mail
--      sozinhos não provam quem é a pessoa).
-- 4) Foto: o bucket member-photos é privado. Quando a busca acha um cadastro, a conta ganha uma permissão de
--    10 minutos para ler SÓ a foto desse cadastro (para o pop-up).

-- Telefone só com dígitos (DDD + número), sem o 55 do país. Nulo se não parecer um telefone completo.
create or replace function public.norm_phone(_s text)
returns text language sql immutable set search_path = public as $$
  select case
    when length(d) in (10, 11) then d
    else null
  end
  from (
    select case
      when length(x) > 11 and left(x, 2) = '55' then substr(x, 3)
      else x
    end as d
    from (select regexp_replace(coalesce(_s, ''), '\D', '', 'g') as x) a
  ) b;
$$;

-- Permissão temporária de leitura de fotos de cadastros encontrados na busca
create table if not exists public.member_match_photo_grants (
  user_id uuid not null,
  photo_path text not null,
  expires_at timestamptz not null,
  primary key (user_id, photo_path)
);
alter table public.member_match_photo_grants enable row level security;
revoke all on public.member_match_photo_grants from anon, authenticated;

create or replace function public.member_photo_granted(_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_match_photo_grants g
    where g.user_id = auth.uid() and g.photo_path = _name and g.expires_at > now()
  );
$$;
revoke all on function public.member_photo_granted(text) from public, anon;
grant execute on function public.member_photo_granted(text) to authenticated;

drop policy if exists "photos read matched" on storage.objects;
create policy "photos read matched" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and public.member_photo_granted(name));

-- A conta precisa passar por "Meu cadastro"?
create or replace function public.needs_member_onboarding()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and not exists (select 1 from public.members m where m.user_id = auth.uid())
    and not exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text <> 'member')
    and not exists (select 1 from public.user_permissions p where p.user_id = auth.uid());
$$;
revoke all on function public.needs_member_onboarding() from public, anon;
grant execute on function public.needs_member_onboarding() to authenticated;

-- Procura cadastros sem conta que batem com CPF, telefone, e-mail ou RG digitados (valores completos).
create or replace function public.find_member_matches(_cpf text, _phone text, _email text, _rg text)
returns table (
  member_id uuid,
  member_name text,
  cpf_last2 text,
  member_email text,
  member_photo text,
  matched_by text[],
  needs_cpf boolean
)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  p text := public.norm_phone(_phone);
  e text := lower(btrim(coalesce(_email, '')));
  r text := regexp_replace(lower(coalesce(_rg, '')), '[^0-9a-z]', '', 'g');
  acct_email text;
begin
  if uid is null then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.members m where m.user_id = uid) then return; end if;

  if length(c) <> 11 then c := null; end if;
  if position('@' in e) < 2 or length(e) < 6 then e := null; end if;
  if length(r) < 5 then r := null; end if;
  if c is null and p is null and e is null and r is null then return; end if;

  if (select count(*) from public.member_claim_attempts a
        where a.user_id = uid and a.kind = 'lookup' and a.created_at > now() - interval '1 hour') >= 40 then
    return;
  end if;
  insert into public.member_claim_attempts (user_id, kind) values (uid, 'lookup');

  select lower(btrim(u.email)) into acct_email
    from auth.users u where u.id = uid and u.email_confirmed_at is not null;

  delete from public.member_match_photo_grants g where g.user_id = uid and g.expires_at < now();

  return query
    with hit as (
      select m.id as mid, m.full_name as mname, m.cpf as mcpf, m.email as memail, m.photo_path as mphoto,
             (c is not null and regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = c) as by_cpf,
             (p is not null and public.norm_phone(m.phone) = p) as by_phone,
             (e is not null and lower(btrim(coalesce(m.email, ''))) = e) as by_email,
             (r is not null and regexp_replace(lower(coalesce(m.rg, '')), '[^0-9a-z]', '', 'g') = r) as by_rg
      from public.members m
      where m.user_id is null and m.approval_status = 'aprovado'
    ), found as (
      select * from hit
      where by_cpf or by_phone or by_email or by_rg
      order by by_cpf desc, by_email desc, by_phone desc, by_rg desc, mname
      limit 5
    ), granted as (
      insert into public.member_match_photo_grants (user_id, photo_path, expires_at)
      select distinct uid, f.mphoto, now() + interval '10 minutes' from found f where f.mphoto is not null
      on conflict (user_id, photo_path) do update set expires_at = excluded.expires_at
      returning 1
    )
    select f.mid,
           f.mname,
           case when length(regexp_replace(coalesce(f.mcpf, ''), '\D', '', 'g')) = 11
                then right(regexp_replace(f.mcpf, '\D', '', 'g'), 2) end,
           f.memail,
           f.mphoto,
           array_remove(array[
             case when f.by_cpf then 'cpf' end,
             case when f.by_phone then 'telefone' end,
             case when f.by_email then 'email' end,
             case when f.by_rg then 'rg' end
           ], null),
           not (f.by_cpf or (f.by_email and acct_email is not null and e = acct_email))
    from found f
    order by f.by_cpf desc, f.by_email desc, f.by_phone desc, f.by_rg desc, f.mname;
end $$;

-- "Sou eu": vincula a conta ao cadastro encontrado. Devolve ok, no_match, cpf_required, wrong_cpf, no_cpf,
-- locked, unavailable ou already_linked.
create or replace function public.claim_member_match(
  _member uuid, _cpf text, _phone text, _email text, _rg text, _confirm_cpf text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  p text := public.norm_phone(_phone);
  e text := lower(btrim(coalesce(_email, '')));
  r text := regexp_replace(lower(coalesce(_rg, '')), '[^0-9a-z]', '', 'g');
  typed text := regexp_replace(coalesce(_confirm_cpf, ''), '\D', '', 'g');
  acct_email text;
  real_cpf text;
  mrow public.members%rowtype;
  fails_user int;
  fails_member int;
  by_cpf boolean;
  by_any boolean;
  strong boolean;
begin
  if uid is null then raise exception 'Acesso negado'; end if;
  if exists (select 1 from public.members m where m.user_id = uid) then return 'already_linked'; end if;

  select count(*) into fails_user from public.member_claim_attempts a
    where a.user_id = uid and a.kind = 'claim' and not a.success and a.created_at > now() - interval '24 hours';
  select count(*) into fails_member from public.member_claim_attempts a
    where a.member_id = _member and a.kind = 'claim' and not a.success and a.created_at > now() - interval '24 hours';
  if fails_user >= 5 or fails_member >= 5 then return 'locked'; end if;

  select * into mrow from public.members m
    where m.id = _member and m.user_id is null and m.approval_status = 'aprovado'
    for update;
  if not found then return 'unavailable'; end if;

  real_cpf := regexp_replace(coalesce(mrow.cpf, ''), '\D', '', 'g');
  by_cpf := length(c) = 11 and length(real_cpf) = 11 and c = real_cpf;
  by_any := by_cpf
    or (p is not null and public.norm_phone(mrow.phone) = p)
    or (position('@' in e) >= 2 and length(e) >= 6 and lower(btrim(coalesce(mrow.email, ''))) = e)
    or (length(r) >= 5 and regexp_replace(lower(coalesce(mrow.rg, '')), '[^0-9a-z]', '', 'g') = r);

  if not by_any then
    insert into public.member_claim_attempts (user_id, member_id, kind, success) values (uid, _member, 'claim', false);
    return 'no_match';
  end if;

  select lower(btrim(u.email)) into acct_email
    from auth.users u where u.id = uid and u.email_confirmed_at is not null;

  strong := by_cpf
    or (acct_email is not null and e = acct_email and lower(btrim(coalesce(mrow.email, ''))) = e);

  if not strong then
    if length(real_cpf) <> 11 then return 'no_cpf'; end if;
    if typed = '' then return 'cpf_required'; end if;
    if typed <> real_cpf then
      insert into public.member_claim_attempts (user_id, member_id, kind, success) values (uid, _member, 'claim', false);
      return 'wrong_cpf';
    end if;
  end if;

  perform set_config('app.claiming_member', 'on', true);
  update public.members set user_id = uid where id = _member and user_id is null;
  perform set_config('app.claiming_member', 'off', true);
  insert into public.member_claim_attempts (user_id, member_id, kind, success) values (uid, _member, 'claim', true);
  delete from public.member_match_photo_grants g where g.user_id = uid;
  return 'ok';
end $$;

revoke all on function public.find_member_matches(text, text, text, text),
  public.claim_member_match(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.find_member_matches(text, text, text, text),
  public.claim_member_match(uuid, text, text, text, text, text) to authenticated;
