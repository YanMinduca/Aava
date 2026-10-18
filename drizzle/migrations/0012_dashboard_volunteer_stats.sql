-- Números do dashboard: quantos departamentos e quantas pessoas voluntárias (membros em pelo menos um departamento),
-- contando só os departamentos que a pessoa logada pode ver. Pode rodar mais de uma vez.
create or replace function public.dashboard_volunteer_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'departments', count(distinct d.id),
    'volunteers', count(distinct dm.member_id)
  )
  from public.departments d
  left join public.department_members dm on dm.department_id = d.id
  where public.can_view_department(auth.uid(), d.id);
$$;
revoke all on function public.dashboard_volunteer_stats() from public, anon;
grant execute on function public.dashboard_volunteer_stats() to authenticated;
