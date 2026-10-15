-- Cargo passa a ser do MEMBRO (escolhido no cadastro) e cada cargo define seu alcance:
--   'all'      = acesso geral (todos os departamentos)
--   'selected' = só os departamentos escolhidos na criação do cargo
--   'linked'   = só os departamentos em que a pessoa está vinculada (padrão)
-- Pode rodar mais de uma vez.

alter table public.church_roles
  add column if not exists scope text not null default 'linked',
  add column if not exists is_leadership boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'church_roles_scope_check') then
    alter table public.church_roles add constraint church_roles_scope_check check (scope in ('all','selected','linked'));
  end if;
end $$;
update public.church_roles set is_leadership = true where code = 'leader';

create table if not exists public.church_role_departments (
  role_id uuid not null references public.church_roles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  primary key (role_id, department_id)
);
alter table public.church_role_departments enable row level security;
drop policy if exists "role_departments read" on public.church_role_departments;
create policy "role_departments read" on public.church_role_departments for select to authenticated using (true);
drop policy if exists "role_departments leadership write" on public.church_role_departments;
create policy "role_departments leadership write" on public.church_role_departments for all to authenticated
  using (public.is_church_leadership(auth.uid())) with check (public.is_church_leadership(auth.uid()));
revoke all on public.church_role_departments from anon;
grant select, insert, update, delete on public.church_role_departments to authenticated;

alter table public.members
  add column if not exists church_role_id uuid references public.church_roles(id) on delete set null;
create index if not exists members_church_role_idx on public.members (church_role_id) where church_role_id is not null;

-- O cargo vinha do vínculo com o departamento; agora vem do membro.
create or replace function public.has_dept_permission(_user_id uuid, _dept uuid, _perm text)
returns boolean language sql stable security definer set search_path = public as $$
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
      select 1 from public.departments d
      join public.members m on m.id = d.leader_member_id
      where m.user_id = _user_id and d.id = _dept
        and _perm in ('dept_view', 'dept_manage_members', 'dept_report')
    )
  );
$$;

create or replace function public.department_roster(_dept uuid)
returns table (member_id uuid, full_name text, phone text, email text, photo_path text, status text,
               church_role_id uuid, role_name text, joined_at timestamptz, is_leader boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_view_department(auth.uid(), _dept) then raise exception 'Acesso negado'; end if;
  return query
    select m.id, m.full_name, m.phone, m.email, m.photo_path, m.status,
           m.church_role_id, r.name, dm.joined_at, (d.leader_member_id = m.id)
    from public.department_members dm
    join public.members m on m.id = dm.member_id
    join public.departments d on d.id = dm.department_id
    left join public.church_roles r on r.id = m.church_role_id
    where dm.department_id = _dept
    order by (d.leader_member_id = m.id) desc, m.full_name;
end $$;

-- department_members.church_role_id fica (obsoleto, só por compatibilidade): o cargo agora é members.church_role_id.
comment on column public.department_members.church_role_id is 'DEPRECATED: o cargo agora fica em members.church_role_id';

-- Quem pode atribuir cargo a um membro: só quem gerencia departamentos (CEO/Pastor Presidente têm por padrão)
create or replace function public.set_member_church_role(_member uuid, _role uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(auth.uid(), 'manage_departments') then raise exception 'Acesso negado'; end if;
  update public.members set church_role_id = _role where id = _member;
end $$;
revoke all on function public.set_member_church_role(uuid, uuid) from public, anon;
grant execute on function public.set_member_church_role(uuid, uuid) to authenticated;

-- members_guard: o cargo concede permissões, então só muda com 'manage_departments'
create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
  else
    new.approval_status := case when old.approval_status = 'recusado' then 'pendente' else old.approval_status end;
    new.status := old.status;
    new.ministry := old.ministry; new.department := old.department; new.church_role := old.church_role; new.church_role_id := old.church_role_id;
    new.affiliated_on := old.affiliated_on;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
