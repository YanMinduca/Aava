alter table public.members
  add column user_id uuid unique,
  add column photo_path text,
  add column cpf text,
  add column rg text,
  add column marital_status text,
  add column joined_on date,
  add column affiliated_on date,
  add column baptism_date date,
  add column ministry text,
  add column department text,
  add column church_role text,
  add column approval_status text not null default 'aprovado',
  add column updated_at timestamptz not null default now();
alter table public.members alter column status set default 'membro';
update public.members set status = 'membro_ativo' where status = 'ativo';
comment on column public.members.notes is 'DEPRECATED: moved to member_notes (admin-only)';

create table public.member_notes (
  member_id uuid primary key references public.members(id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.member_notes to authenticated;
grant all on public.member_notes to service_role;
alter table public.member_notes enable row level security;
create policy "notes view" on public.member_notes for select to authenticated using (public.has_permission(auth.uid(), 'view_member_notes'));
create policy "notes write" on public.member_notes for all to authenticated
  using (public.has_permission(auth.uid(), 'view_member_notes')) with check (public.has_permission(auth.uid(), 'view_member_notes'));
insert into public.member_notes (member_id, notes) select id, notes from public.members where coalesce(notes,'') <> '';

create policy "own member read" on public.members for select to authenticated using (user_id = auth.uid());
create policy "own member insert" on public.members for insert to authenticated with check (user_id = auth.uid());
create policy "own member update" on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_permission(auth.uid(), 'approve_member') or public.has_permission(auth.uid(), 'edit_member') or public.has_permission(auth.uid(), 'create_member') then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.approval_status := 'pendente';
    new.status := 'membro';
    new.ministry := null; new.department := null; new.church_role := null;
    new.affiliated_on := null;
  else
    new.approval_status := case when old.approval_status = 'recusado' then 'pendente' else old.approval_status end;
    new.status := old.status;
    new.ministry := old.ministry; new.department := old.department; new.church_role := old.church_role;
    new.affiliated_on := old.affiliated_on;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end; $$;
create trigger members_guard before insert or update on public.members for each row execute function public.members_guard();

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  note text,
  created_by uuid,
  used_by uuid,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.member_invites to authenticated;
grant all on public.member_invites to service_role;
alter table public.member_invites enable row level security;
create policy "invites manage" on public.member_invites for all to authenticated
  using (public.has_permission(auth.uid(), 'invite_member')) with check (public.has_permission(auth.uid(), 'invite_member'));

create or replace function public.check_invite(_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.member_invites where code = upper(_code) and used_at is null and expires_at > now())
$$;
grant execute on function public.check_invite(text) to anon, authenticated;

create or replace function public.use_invite(_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.member_invites set used_by = auth.uid(), used_at = now()
   where code = upper(_code) and used_at is null and expires_at > now() and auth.uid() is not null;
  get diagnostics n = row_count;
  return n > 0;
end; $$;
grant execute on function public.use_invite(text) to authenticated;

alter table public.financial_transactions
  add column responsible text,
  add column payment_method text,
  add column receipt_path text,
  add column notes text;

alter table public.financial_goals
  add column start_date date,
  add column recurrence text not null default 'nao',
  add column responsible text,
  add column status text not null default 'em_andamento',
  add column manual_amount numeric(12,2);

create table public.recurring_bills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  due_day int not null default 10 check (due_day between 1 and 31),
  payment_method text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.recurring_bills to authenticated;
grant all on public.recurring_bills to service_role;
alter table public.recurring_bills enable row level security;
create policy "bills view" on public.recurring_bills for select to authenticated using (public.has_permission(auth.uid(), 'view_finance'));
create policy "bills write" on public.recurring_bills for all to authenticated
  using (public.has_permission(auth.uid(), 'edit_financial_transaction')) with check (public.has_permission(auth.uid(), 'edit_financial_transaction'));

create policy "photos read" on storage.objects for select to authenticated
  using (bucket_id = 'member-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission(auth.uid(), 'view_members')));
create policy "photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'member-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission(auth.uid(), 'edit_member') or public.has_permission(auth.uid(), 'create_member')));
create policy "photos update" on storage.objects for update to authenticated
  using (bucket_id = 'member-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission(auth.uid(), 'edit_member')));
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.has_permission(auth.uid(), 'view_finance'));
create policy "receipts write" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.has_permission(auth.uid(), 'create_financial_transaction'));