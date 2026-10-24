-- Vários líderes (opcionais) por departamento.
-- department_leaders é a ÚNICA fonte de líderes; departments.leader_member_id fica obsoleta.
-- Já aplicada no Supabase do Aava; este arquivo mantém o histórico no repositório.
create table if not exists public.department_leaders (
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, member_id)
);
create index if not exists department_leaders_member_idx on public.department_leaders(member_id);

alter table public.department_leaders enable row level security;

drop policy if exists "department_leaders read" on public.department_leaders;
drop policy if exists "department_leaders insert" on public.department_leaders;
drop policy if exists "department_leaders delete" on public.department_leaders;
create policy "department_leaders read" on public.department_leaders
  for select to authenticated using (public.can_view_department(auth.uid(), department_id));
create policy "department_leaders insert" on public.department_leaders
  for insert to authenticated with check (public.has_permission(auth.uid(), 'manage_departments'));
create policy "department_leaders delete" on public.department_leaders
  for delete to authenticated using (public.has_permission(auth.uid(), 'manage_departments'));

-- Copia o líder único antigo (se ainda houver) e zera a coluna obsoleta
insert into public.department_leaders (department_id, member_id)
select id, leader_member_id from public.departments where leader_member_id is not null
on conflict do nothing;
update public.departments set leader_member_id = null where leader_member_id is not null;
comment on column public.departments.leader_member_id is 'DEPRECATED: use public.department_leaders (vários líderes por departamento)';

create or replace function public.department_members_clear_leader()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.department_leaders where department_id = old.department_id and member_id = old.member_id;
  return old;
end $$;

create or replace function public.has_dept_permission(_user_id uuid, _dept uuid, _perm text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select _user_id is not null and (
    public.is_church_leadership(_user_id)
    or public.has_permission(_user_id, 'manage_departments')
    or exists (
      select 1 from public.members m
      join public.church_roles r on r.id = m.church_role_id
      where m.user_id = _user_id and _perm = any (r.permissions)
        and (
          r.scope = 'all'
          or (r.scope = 'selected' and exists (
                select 1 from public.church_role_departments rd where rd.role_id = r.id and rd.department_id = _dept))
          or (r.scope = 'linked' and exists (
                select 1 from public.department_members dm where dm.member_id = m.id and dm.department_id = _dept))
        )
    )
    or exists (
      select 1 from public.department_leaders dl
      join public.members m on m.id = dl.member_id
      where m.user_id = _user_id and dl.department_id = _dept
        and _perm in ('dept_view', 'dept_manage_members', 'dept_report')
    )
  );
$$;

drop function if exists public.department_overview();
create function public.department_overview()
returns table (
  id uuid, name text, description text,
  leader_member_id uuid, leader_name text,
  leader_member_ids uuid[], leader_names text[],
  member_count bigint, created_at timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select d.id, d.name, d.description,
         ld.member_ids[1], ld.names[1],
         coalesce(ld.member_ids, '{}'::uuid[]), coalesce(ld.names, '{}'::text[]),
         (select count(*) from public.department_members dm where dm.department_id = d.id),
         d.created_at
  from public.departments d
  left join lateral (
    select array_agg(dl.member_id order by lm.full_name, lm.id) as member_ids,
           array_agg(lm.full_name order by lm.full_name, lm.id) as names
    from public.department_leaders dl
    join public.members lm on lm.id = dl.member_id
    where dl.department_id = d.id
  ) ld on true
  where public.can_view_department(auth.uid(), d.id)
     or exists (select 1 from public.department_members dm join public.members m on m.id = dm.member_id
                where dm.department_id = d.id and m.user_id = auth.uid())
  order by d.name;
$$;
revoke execute on function public.department_overview() from public, anon;
grant execute on function public.department_overview() to authenticated;

create or replace function public.department_roster(_dept uuid)
returns table (member_id uuid, full_name text, phone text, email text, photo_path text, status text, church_role_id uuid, role_name text, joined_at timestamptz, is_leader boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.can_view_department(auth.uid(), _dept) then raise exception 'Acesso negado'; end if;
  return query
    select m.id, m.full_name, m.phone, m.email, m.photo_path, m.status,
           m.church_role_id, r.name, dm.joined_at,
           exists (select 1 from public.department_leaders dl where dl.department_id = dm.department_id and dl.member_id = m.id)
    from public.department_members dm
    join public.members m on m.id = dm.member_id
    left join public.church_roles r on r.id = m.church_role_id
    where dm.department_id = _dept
    order by 10 desc, m.full_name;
end $$;
