create or replace function public.department_roster(_dept uuid)
returns table (member_id uuid, full_name text, phone text, email text, photo_path text, status text, church_role_id uuid, role_name text, joined_at timestamptz, is_leader boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.can_view_department(auth.uid(), _dept) then raise exception 'Acesso negado'; end if;
  return query
    select m.id, m.full_name, m.phone, m.email, m.photo_path, m.status,
           m.church_role_id, r.name, dm.joined_at,
           (
             m.id = d.leader_member_id
             or exists (
               select 1 from public.department_leaders dl
               where dl.department_id = dm.department_id and dl.member_id = m.id
             )
           )
    from public.department_members dm
    join public.members m on m.id = dm.member_id
    join public.departments d on d.id = dm.department_id
    left join public.church_roles r on r.id = m.church_role_id
    where dm.department_id = _dept
    order by 10 desc, m.full_name;
end $$;
