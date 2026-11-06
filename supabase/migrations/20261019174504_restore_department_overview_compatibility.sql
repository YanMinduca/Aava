drop function if exists public.department_overview();

create function public.department_overview()
returns table (
  id uuid,
  name text,
  description text,
  leader_member_id uuid,
  leader_name text,
  leader_member_ids uuid[],
  leader_names text[],
  member_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path to 'public' as $$
  select d.id,
         d.name,
         d.description,
         d.leader_member_id,
         lm.full_name,
         coalesce((
           select array_agg(dl.member_id order by m2.full_name)
           from public.department_leaders dl
           join public.members m2 on m2.id = dl.member_id
           where dl.department_id = d.id
         ), '{}'::uuid[]),
         coalesce((
           select array_agg(m3.full_name order by m3.full_name)
           from public.department_leaders dl2
           join public.members m3 on m3.id = dl2.member_id
           where dl2.department_id = d.id
         ), '{}'::text[]),
         (select count(*) from public.department_members dm where dm.department_id = d.id),
         d.created_at
  from public.departments d
  left join public.members lm on lm.id = d.leader_member_id
  where public.can_view_department(auth.uid(), d.id)
     or exists (
       select 1
       from public.department_members dm
       join public.members m on m.id = dm.member_id
       where dm.department_id = d.id and m.user_id = auth.uid()
     )
  order by d.name;
$$;

revoke execute on function public.department_overview() from public, anon;
grant execute on function public.department_overview() to authenticated;
