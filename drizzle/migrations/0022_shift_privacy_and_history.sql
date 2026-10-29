-- 1) Escalas: quem não é liderança da igreja (CEO / pastor presidente) vê só o(s) departamento(s) onde é líder ou voluntário.
create or replace function public.can_see_shifts(_user uuid, _dept uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _user is not null and (
    public.can_manage_shifts(_user, _dept)
    or exists (
      select 1 from public.department_members dm join public.members m on m.id = dm.member_id
      where dm.department_id = _dept and m.user_id = _user)
  )
$$;

-- 2) Líder tira uma pessoa da escala (inclusive a última: aí a escala do culto é apagada).
create or replace function public.remove_shift_member(_shift uuid, _member uuid) returns text
language plpgsql security definer set search_path = public as $$
declare s public.dept_shifts%rowtype; dname text; gone int; left_n int;
begin
  select * into s from public.dept_shifts x where x.id = _shift;
  if not found then return 'shift_deleted'; end if;
  if not public.can_manage_shifts(auth.uid(), s.department_id) then raise exception 'forbidden'; end if;
  delete from public.dept_shift_members where shift_id = _shift and member_id = _member;
  get diagnostics gone = row_count;
  if gone > 0 and s.shift_date >= public.today_br() then
    select d.name into dname from public.departments d where d.id = s.department_id;
    perform public.shift_push(_member, 'Escala atualizada',
      'Você não está mais escalado: ' || dname || ' · ' || public.shift_label(s.service_name, s.shift_date, s.service_time), 'escala-' || _shift);
  end if;
  select count(*) into left_n from public.dept_shift_members where shift_id = _shift;
  if left_n = 0 then
    delete from public.dept_shifts where id = _shift;
    return 'shift_deleted';
  end if;
  return 'removed';
end $$;

-- 3) Histórico de avisos (push): quem pode enviar avisos também pode apagar o histórico de todos.
create or replace function public.delete_push_history(_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_permission(auth.uid(), 'send_push') then raise exception 'forbidden'; end if;
  delete from public.push_notifications where id = any(coalesce(_ids, '{}'::uuid[]));
  get diagnostics n = row_count;
  return n;
end $$;

-- Sem número de dias = apaga tudo.
create or replace function public.clear_push_history(_older_than_days int default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_permission(auth.uid(), 'send_push') then raise exception 'forbidden'; end if;
  if _older_than_days is null then
    delete from public.push_notifications where true;
  else
    delete from public.push_notifications where created_at < now() - make_interval(days => greatest(_older_than_days, 0));
  end if;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.remove_shift_member(uuid, uuid), public.delete_push_history(uuid[]), public.clear_push_history(int) from public, anon;
grant execute on function public.remove_shift_member(uuid, uuid), public.delete_push_history(uuid[]), public.clear_push_history(int) to authenticated, service_role;
