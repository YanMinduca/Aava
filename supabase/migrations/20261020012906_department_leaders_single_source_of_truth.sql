-- department_leaders passa a ser a ÚNICA fonte de líderes.
-- A coluna departments.leader_member_id fica obsoleta e é zerada (os dados já estão em department_leaders).
update public.departments set leader_member_id = null where leader_member_id is not null;

drop function if exists public.department_overview();
create function public.department_overview()
returns table (
  id uuid, name text, description text,
  leader_member_id uuid, leader_name text,          -- legado: primeiro líder (compatibilidade com o front antigo)
  leader_member_ids uuid[], leader_names text[],    -- todos os líderes
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
