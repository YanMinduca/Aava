alter table public.member_activity
  add column if not exists account_name text,
  add column if not exists account_email text;

update public.member_activity a
set
  account_name = coalesce(
    a.account_name,
    (select p.full_name from public.profiles p where p.id = a.user_id),
    (select m.full_name from public.members m where m.id = a.member_id)
  ),
  account_email = coalesce(
    a.account_email,
    (select p.email from public.profiles p where p.id = a.user_id),
    (select m.email from public.members m where m.id = a.member_id)
  )
where a.account_name is null or a.account_email is null;

create or replace function public.trg_member_activity_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  linked_name text;
  linked_email text;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.member_activity (kind, member_id, user_id, account_name, account_email)
      values ('member_created', new.id, new.user_id, new.full_name, new.email);

      if new.user_id is not null then
        select p.full_name, p.email into linked_name, linked_email
        from public.profiles p where p.id = new.user_id;

        insert into public.member_activity (kind, member_id, user_id, account_name, account_email)
        values ('account_linked', new.id, new.user_id,
          coalesce(linked_name, new.full_name), coalesce(linked_email, new.email));
      end if;
    elsif tg_op = 'UPDATE' and old.user_id is null and new.user_id is not null then
      select p.full_name, p.email into linked_name, linked_email
      from public.profiles p where p.id = new.user_id;

      insert into public.member_activity (kind, member_id, user_id, account_name, account_email)
      values ('account_linked', new.id, new.user_id,
        coalesce(linked_name, new.full_name), coalesce(linked_email, new.email));
    end if;
  exception when others then
    raise warning 'member_activity (members): %', sqlerrm;
  end;
  return null;
end $function$;

create or replace function public.trg_member_activity_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  begin
    insert into public.member_activity (kind, user_id, account_name, account_email)
    values ('account_created', new.id, new.full_name, new.email);
  exception when others then
    raise warning 'member_activity (profiles): %', sqlerrm;
  end;
  return null;
end $function$;
