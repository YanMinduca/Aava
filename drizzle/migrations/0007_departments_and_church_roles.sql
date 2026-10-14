-- Departamentos, cargos (criáveis) e permissões por departamento. Pode rodar mais de uma vez.

-- 1) Permissões globais novas ficam em user_permissions (view_departments, manage_departments).
--    Permissões POR DEPARTAMENTO ficam no cargo: dept_view, dept_manage_members, dept_report.

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  leader_member_id uuid references public.members(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists departments_name_key on public.departments (lower(name));

create table if not exists public.church_roles (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  description text,
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists church_roles_name_key on public.church_roles (lower(name));

create table if not exists public.department_members (
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  church_role_id uuid references public.church_roles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (department_id, member_id)
);
create index if not exists department_members_member_idx on public.department_members (member_id);

insert into public.church_roles (code, name, description, permissions, is_system) values
  ('volunteer', 'Voluntário', 'Participa do departamento.', array['dept_view']::text[], true),
  ('leader', 'Líder', 'Lidera o departamento: gerencia voluntários e gera relatórios.', array['dept_view','dept_manage_members','dept_report']::text[], true)
on conflict (code) do nothing;

-- 2) Funções de permissão
create or replace function public.is_church_leadership(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'ceo') or public.has_role(_user_id, 'pastor_presidente');
$$;

create or replace function public.has_dept_permission(_user_id uuid, _dept uuid, _perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select _user_id is not null and (
    public.is_church_leadership(_user_id)
    or public.has_permission(_user_id, 'manage_departments')
    or exists (
      select 1 from public.department_members dm
      join public.members m on m.id = dm.member_id
      join public.church_roles r on r.id = dm.church_role_id
      where m.user_id = _user_id and dm.department_id = _dept and _perm = any (r.permissions)
    )
    or exists (
      select 1 from public.departments d
      join public.members m on m.id = d.leader_member_id
      where m.user_id = _user_id and d.id = _dept
        and _perm in ('dept_view', 'dept_manage_members', 'dept_report')
    )
  );
$$;

create or replace function public.can_view_department(_user_id uuid, _dept uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(_user_id, 'view_departments')
      or public.has_dept_permission(_user_id, _dept, 'dept_view');
$$;

-- 3) RLS
alter table public.departments enable row level security;
alter table public.church_roles enable row level security;
alter table public.department_members enable row level security;

drop policy if exists "departments read" on public.departments;
create policy "departments read" on public.departments for select to authenticated
  using (public.can_view_department(auth.uid(), id));
drop policy if exists "departments insert" on public.departments;
create policy "departments insert" on public.departments for insert to authenticated
  with check (public.has_permission(auth.uid(), 'manage_departments'));
drop policy if exists "departments update" on public.departments;
create policy "departments update" on public.departments for update to authenticated
  using (public.has_permission(auth.uid(), 'manage_departments'))
  with check (public.has_permission(auth.uid(), 'manage_departments'));
drop policy if exists "departments delete" on public.departments;
create policy "departments delete" on public.departments for delete to authenticated
  using (public.has_permission(auth.uid(), 'manage_departments'));

drop policy if exists "church_roles read" on public.church_roles;
create policy "church_roles read" on public.church_roles for select to authenticated using (true);
drop policy if exists "church_roles leadership insert" on public.church_roles;
create policy "church_roles leadership insert" on public.church_roles for insert to authenticated
  with check (public.is_church_leadership(auth.uid()));
drop policy if exists "church_roles leadership update" on public.church_roles;
create policy "church_roles leadership update" on public.church_roles for update to authenticated
  using (public.is_church_leadership(auth.uid())) with check (public.is_church_leadership(auth.uid()));
drop policy if exists "church_roles leadership delete" on public.church_roles;
create policy "church_roles leadership delete" on public.church_roles for delete to authenticated
  using (public.is_church_leadership(auth.uid()) and not is_system);

drop policy if exists "department_members read" on public.department_members;
create policy "department_members read" on public.department_members for select to authenticated
  using (public.can_view_department(auth.uid(), department_id));
drop policy if exists "department_members insert" on public.department_members;
create policy "department_members insert" on public.department_members for insert to authenticated
  with check (public.has_dept_permission(auth.uid(), department_id, 'dept_manage_members'));
drop policy if exists "department_members update" on public.department_members;
create policy "department_members update" on public.department_members for update to authenticated
  using (public.has_dept_permission(auth.uid(), department_id, 'dept_manage_members'))
  with check (public.has_dept_permission(auth.uid(), department_id, 'dept_manage_members'));
drop policy if exists "department_members delete" on public.department_members;
create policy "department_members delete" on public.department_members for delete to authenticated
  using (public.has_dept_permission(auth.uid(), department_id, 'dept_manage_members'));

revoke all on public.departments, public.church_roles, public.department_members from anon;
grant select, insert, update, delete on public.departments, public.church_roles, public.department_members to authenticated;

-- 4) Se o líder sai do departamento, o campo de líder é limpo
create or replace function public.department_members_clear_leader()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.departments set leader_member_id = null
   where id = old.department_id and leader_member_id = old.member_id;
  return old;
end $$;
drop trigger if exists department_members_clear_leader on public.department_members;
create trigger department_members_clear_leader after delete on public.department_members
  for each row execute function public.department_members_clear_leader();
revoke all on function public.department_members_clear_leader() from public, anon, authenticated;

-- 5) RPCs: expõem só o necessário (sem CPF/RG/endereço) para líderes sem acesso à lista de membros
create or replace function public.department_overview()
returns table (id uuid, name text, description text, leader_member_id uuid, leader_name text, member_count bigint, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.description, d.leader_member_id, lm.full_name,
         (select count(*) from public.department_members dm where dm.department_id = d.id), d.created_at
  from public.departments d
  left join public.members lm on lm.id = d.leader_member_id
  where public.can_view_department(auth.uid(), d.id)
     or exists (select 1 from public.department_members dm join public.members m on m.id = dm.member_id
                where dm.department_id = d.id and m.user_id = auth.uid())
  order by d.name;
$$;

create or replace function public.department_roster(_dept uuid)
returns table (member_id uuid, full_name text, phone text, email text, photo_path text, status text,
               church_role_id uuid, role_name text, joined_at timestamptz, is_leader boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_department(auth.uid(), _dept) then raise exception 'Acesso negado'; end if;
  return query
    select m.id, m.full_name, m.phone, m.email, m.photo_path, m.status,
           dm.church_role_id, r.name, dm.joined_at, (d.leader_member_id = m.id)
    from public.department_members dm
    join public.members m on m.id = dm.member_id
    join public.departments d on d.id = dm.department_id
    left join public.church_roles r on r.id = dm.church_role_id
    where dm.department_id = _dept
    order by (d.leader_member_id = m.id) desc, m.full_name;
end $$;

create or replace function public.department_candidates(_dept uuid)
returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_dept_permission(auth.uid(), _dept, 'dept_manage_members') then raise exception 'Acesso negado'; end if;
  return query
    select m.id, m.full_name from public.members m
    where m.approval_status = 'aprovado'
      and not exists (select 1 from public.department_members dm where dm.department_id = _dept and dm.member_id = m.id)
    order by m.full_name;
end $$;

create or replace function public.member_departments()
returns table (member_id uuid, department_id uuid, department_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_permission(auth.uid(), 'view_members') or public.has_permission(auth.uid(), 'view_departments')) then
    raise exception 'Acesso negado';
  end if;
  return query
    select dm.member_id, d.id, d.name from public.department_members dm
    join public.departments d on d.id = dm.department_id
    order by d.name;
end $$;

revoke all on function public.department_overview(), public.department_roster(uuid), public.department_candidates(uuid), public.member_departments() from public, anon;
grant execute on function public.department_overview(), public.department_roster(uuid), public.department_candidates(uuid), public.member_departments() to authenticated;
revoke all on function public.has_dept_permission(uuid, uuid, text), public.can_view_department(uuid, uuid), public.is_church_leadership(uuid) from public, anon;
grant execute on function public.has_dept_permission(uuid, uuid, text), public.can_view_department(uuid, uuid), public.is_church_leadership(uuid) to authenticated;
