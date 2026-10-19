-- Parte 1: limpa resíduos de usuários já apagados e liga as tabelas à de usuários (exclusão em cascata).
-- Pode rodar mais de uma vez.

-- 1) Resíduos de usuários que já não existem
alter table public.members disable trigger members_guard;
update public.members set user_id = null where user_id is not null and user_id not in (select id from auth.users);
alter table public.members enable trigger members_guard;
delete from public.user_roles where user_id not in (select id from auth.users);
delete from public.user_permissions where user_id not in (select id from auth.users);
delete from public.profiles where id not in (select id from auth.users);
delete from public.member_claim_attempts where user_id not in (select id from auth.users);
delete from public.prayer_requests where user_id is not null and user_id not in (select id from auth.users);
delete from public.event_registrations where user_id not in (select id from auth.users);

-- 2) Ligações: apagar o usuário apaga o que é dele (de qualquer lugar, inclusive do painel do Supabase)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_id_users_fkey') then
    alter table public.profiles add constraint profiles_id_users_fkey foreign key (id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_user_users_fkey') then
    alter table public.user_roles add constraint user_roles_user_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_permissions_user_users_fkey') then
    alter table public.user_permissions add constraint user_permissions_user_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'member_claim_attempts_user_users_fkey') then
    alter table public.member_claim_attempts add constraint member_claim_attempts_user_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prayer_requests_user_users_fkey') then
    alter table public.prayer_requests add constraint prayer_requests_user_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_user_users_fkey') then
    alter table public.event_registrations add constraint event_registrations_user_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  -- O cadastro do membro é da igreja: ao apagar a conta, ele continua, só perde o vínculo.
  if not exists (select 1 from pg_constraint where conname = 'members_user_users_fkey') then
    alter table public.members add constraint members_user_users_fkey foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 3) members_guard: libera SÓ o "soltar vínculo" feito pela própria ligação acima (gatilho dentro de gatilho)
create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and old.user_id is not null and new.user_id is null then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' and current_setting('app.event_visitor', true) = 'on'
     and new.user_id = auth.uid() and new.status = 'visitante' then
    new.approval_status := 'aprovado'; new.registration_number := null; new.church_role_id := null;
    new.ministry := null; new.department := null; new.church_role := null; new.affiliated_on := null;
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE'
     and current_setting('app.claiming_member', true) = 'on'
     and old.user_id is null and new.user_id = auth.uid() then
    new.updated_at := now();
    return new;
  end if;
  new.registration_number := nullif(btrim(new.registration_number), '');
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
    new.registration_number := null;
  else
    new.approval_status := case when old.approval_status = 'recusado' then 'pendente' else old.approval_status end;
    new.status := old.status;
    new.ministry := old.ministry; new.department := old.department; new.church_role := old.church_role; new.church_role_id := old.church_role_id;
    new.affiliated_on := old.affiliated_on;
    new.registration_number := old.registration_number;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
