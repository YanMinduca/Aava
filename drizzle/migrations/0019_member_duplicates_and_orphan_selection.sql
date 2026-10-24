-- 1) Um CPF só pode existir em um cadastro (compara só os dígitos, ignora pontos e traço).
--    Cadastros sem CPF (ou com CPF incompleto) continuam permitidos.
create unique index if not exists members_cpf_digits_key
  on public.members ((regexp_replace(cpf, '\D', '', 'g')))
  where length(regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) = 11;

-- 2) Para quem cadastra/edita membros: mostra cadastros que já têm o mesmo nome, CPF ou RG.
create or replace function public.find_member_duplicates(_name text, _cpf text, _rg text, _exclude uuid default null)
returns table (
  id uuid, full_name text, registration_number text, status text, approval_status text,
  has_account boolean, match_name boolean, match_cpf boolean, match_rg boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  n text := public.norm_name(_name);
  c text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  r text := regexp_replace(lower(coalesce(_rg, '')), '[^0-9a-z]', '', 'g');
begin
  if auth.uid() is null
     or not (public.has_permission(auth.uid(), 'view_members')
          or public.has_permission(auth.uid(), 'create_member')
          or public.has_permission(auth.uid(), 'edit_member')) then
    raise exception 'Acesso negado';
  end if;
  if coalesce(array_length(string_to_array(n, ' '), 1), 0) < 2 then n := null; end if;
  if length(c) <> 11 then c := null; end if;
  if length(r) < 5 then r := null; end if;
  if n is null and c is null and r is null then return; end if;
  return query
    with x as (
      select m.id as mid, m.full_name as mname, m.registration_number as mreg, m.status as mstatus,
             m.approval_status as mappr, (m.user_id is not null) as macc,
             (n is not null and public.norm_name(m.full_name) = n) as mn,
             (c is not null and regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = c) as mc,
             (r is not null and regexp_replace(lower(coalesce(m.rg, '')), '[^0-9a-z]', '', 'g') = r) as mr
      from public.members m
      where _exclude is null or m.id <> _exclude
    )
    select x.mid, x.mname, x.mreg, x.mstatus, x.mappr, x.macc, x.mn, x.mc, x.mr
    from x where x.mn or x.mc or x.mr
    order by x.mc desc, x.mr desc, x.mn desc, x.mname
    limit 5;
end $$;

-- 3) Para quem está criando conta: o CPF digitado já tem cadastro? Devolve só o nome abreviado (sem expor dados).
--    state: claimable (pode vincular) | in_use (já vinculado a outra conta) | pending (aguardando aprovação) | limited (muitas consultas)
create or replace function public.check_cpf_for_signup(_cpf text)
returns table (id uuid, masked_name text, state text)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
begin
  if uid is null then raise exception 'Acesso negado'; end if;
  if length(c) <> 11 then return; end if;
  if (select count(*) from public.member_claim_attempts a
        where a.user_id = uid and a.kind = 'lookup' and a.created_at > now() - interval '1 hour') >= 30 then
    return query select null::uuid, null::text, 'limited'::text;
    return;
  end if;
  insert into public.member_claim_attempts (user_id, kind) values (uid, 'lookup');
  return query
    select m.id,
           split_part(btrim(m.full_name), ' ', 1)
             || coalesce(' ' || (select string_agg(left(w, 1) || '.', ' ')
                                   from unnest((string_to_array(btrim(m.full_name), ' '))[2:]) w where w <> ''), ''),
           case when m.user_id is not null then 'in_use'
                when m.approval_status = 'aprovado' then 'claimable'
                else 'pending' end
    from public.members m
    where regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') = c
      and m.user_id is distinct from uid
    limit 1;
end $$;

-- 4) Arquivos sem uso: apaga só os que a pessoa marcou (e que continuam sem uso na hora de apagar).
create or replace function public.storage_enqueue_orphans_selected(_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_church_leadership(auth.uid()) then raise exception 'Acesso negado'; end if;
  with wanted as (
    select i ->> 'bucket' as b, i ->> 'path' as p from jsonb_array_elements(coalesce(_items, '[]'::jsonb)) i
  ), ins as (
    insert into public.storage_trash (bucket, path)
    select o.bucket, o.path from public.storage_orphans_preview() o
    join wanted w on w.b = o.bucket and w.p = o.path
    on conflict (bucket, path) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

revoke all on function public.find_member_duplicates(text, text, text, uuid), public.check_cpf_for_signup(text),
  public.storage_enqueue_orphans_selected(jsonb) from public, anon;
grant execute on function public.find_member_duplicates(text, text, text, uuid), public.check_cpf_for_signup(text),
  public.storage_enqueue_orphans_selected(jsonb) to authenticated, service_role;
