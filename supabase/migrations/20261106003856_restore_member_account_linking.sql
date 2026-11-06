-- Restore CEO / Pastor Presidente account linking RPCs.
-- The frontend already calls these functions; the older Drizzle migration
-- was not present in the Supabase migration history, so the remote DB never
-- received the functions or the matching members_guard bypass.

create or replace function public.list_accounts_for_linking()
returns table (
  account_id uuid,
  account_name text,
  account_email text,
  member_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_church_leadership(uid) then
    raise exception 'Acesso negado';
  end if;

  return query
    select p.id, p.full_name, p.email, m.id
    from public.profiles p
    left join public.members m on m.user_id = p.id
    order by lower(coalesce(nullif(p.full_name, ''), p.email, ''));
end;
$$;

create or replace function public.link_member_account(_member uuid, _user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_user_id uuid;
begin
  if uid is null or not public.is_church_leadership(uid) then
    raise exception 'Acesso negado';
  end if;

  if _member is null or _user is null then
    return 'invalid_input';
  end if;

  select m.user_id
    into current_user_id
  from public.members m
  where m.id = _member
  for update;

  if not found then
    return 'member_not_found';
  end if;

  if current_user_id is not null then
    return 'member_already_linked';
  end if;

  perform 1
  from public.profiles p
  where p.id = _user
  for key share;

  if not found then
    return 'user_not_found';
  end if;

  if exists (
    select 1 from public.members m
    where m.user_id = _user
  ) then
    return 'user_already_linked';
  end if;

  perform set_config('app.linking_member', 'on', true);

  update public.members
  set user_id = _user
  where id = _member
    and user_id is null;

  perform set_config('app.linking_member', 'off', true);

  if not found then
    return 'member_already_linked';
  end if;

  return 'ok';
exception
  when unique_violation then
    return 'user_already_linked';
end;
$$;

create or replace function public.unlink_member_account(_member uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_user_id uuid;
begin
  if uid is null or not public.is_church_leadership(uid) then
    raise exception 'Acesso negado';
  end if;

  select m.user_id
    into current_user_id
  from public.members m
  where m.id = _member
  for update;

  if not found then
    return 'member_not_found';
  end if;

  if current_user_id is null then
    return 'ok';
  end if;

  perform set_config('app.unlinking_member', 'on', true);

  update public.members
  set user_id = null
  where id = _member
    and user_id is not null;

  perform set_config('app.unlinking_member', 'off', true);

  return 'ok';
end;
$$;

-- Restore the narrowly-scoped trigger exceptions used only by the two RPCs.
-- Keep all existing member approval, visitor, claim and cascade protections.
create or replace function public.members_guard()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if tg_op = 'UPDATE'
     and current_setting('app.linking_member', true) = 'on'
     and public.is_church_leadership(auth.uid())
     and old.user_id is null
     and new.user_id is not null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE'
     and current_setting('app.unlinking_member', true) = 'on'
     and public.is_church_leadership(auth.uid())
     and old.user_id is not null
     and new.user_id is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.user_id is not null
     and new.user_id is null then
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT'
     and current_setting('app.event_visitor', true) = 'on'
     and new.user_id = auth.uid()
     and new.status = 'visitante' then
    new.approval_status := 'aprovado';
    new.registration_number := null;
    new.church_role_id := null;
    new.ministry := null;
    new.department := null;
    new.church_role := null;
    new.affiliated_on := null;
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'UPDATE'
     and current_setting('app.claiming_member', true) = 'on'
     and old.user_id is null
     and new.user_id = auth.uid() then
    new.updated_at := now();
    return new;
  end if;

  new.registration_number := nullif(btrim(new.registration_number), '');

  if public.has_permission(auth.uid(), 'approve_member')
     or public.has_permission(auth.uid(), 'edit_member')
     or public.has_permission(auth.uid(), 'create_member') then
    if not public.has_permission(auth.uid(), 'manage_departments') then
      if tg_op = 'INSERT' then
        new.church_role_id := null;
      else
        new.church_role_id := old.church_role_id;
      end if;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.approval_status := 'pendente';
    new.status := 'membro';
    new.ministry := null;
    new.department := null;
    new.church_role := null;
    new.church_role_id := null;
    new.affiliated_on := null;
    new.registration_number := null;
  else
    new.approval_status := case
      when old.approval_status = 'recusado' then 'pendente'
      else old.approval_status
    end;
    new.status := old.status;
    new.ministry := old.ministry;
    new.department := old.department;
    new.church_role := old.church_role;
    new.church_role_id := old.church_role_id;
    new.affiliated_on := old.affiliated_on;
    new.registration_number := old.registration_number;
    new.user_id := old.user_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.list_accounts_for_linking() from public, anon;
revoke all on function public.link_member_account(uuid, uuid) from public, anon;
revoke all on function public.unlink_member_account(uuid) from public, anon;

grant execute on function public.list_accounts_for_linking() to authenticated;
grant execute on function public.link_member_account(uuid, uuid) to authenticated;
grant execute on function public.unlink_member_account(uuid) to authenticated;

notify pgrst, 'reload schema';
