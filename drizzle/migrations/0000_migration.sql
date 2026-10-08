create type public.app_role as enum ('ceo','admin','leader','volunteer','member');

create table public.profiles (
  id uuid primary key,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  unique (user_id, role)
);
create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  permission text not null,
  unique (user_id, permission)
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  birth_date date,
  address text,
  status text not null default 'ativo',
  baptized boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('entrada','saida')),
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  category text,
  deadline date,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles, public.user_roles, public.user_permissions, public.members, public.financial_transactions, public.financial_goals to authenticated;
grant all on public.profiles, public.user_roles, public.user_permissions, public.members, public.financial_transactions, public.financial_goals to service_role;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.members enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_goals enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'ceo')
    or exists (select 1 from public.user_permissions where user_id = _user_id and permission = _permission)
$$;

-- profiles
create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission(auth.uid(), 'manage_permissions'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

-- roles / permissions
create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission(auth.uid(), 'manage_permissions'));
create policy "ceo manages roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'ceo')) with check (public.has_role(auth.uid(), 'ceo'));
create policy "read own perms" on public.user_permissions for select to authenticated
  using (user_id = auth.uid() or public.has_permission(auth.uid(), 'manage_permissions'));
create policy "ceo manages perms" on public.user_permissions for all to authenticated
  using (public.has_role(auth.uid(), 'ceo')) with check (public.has_role(auth.uid(), 'ceo'));

-- members
create policy "view members" on public.members for select to authenticated using (public.has_permission(auth.uid(), 'view_members'));
create policy "create members" on public.members for insert to authenticated with check (public.has_permission(auth.uid(), 'create_member'));
create policy "edit members" on public.members for update to authenticated using (public.has_permission(auth.uid(), 'edit_member'));
create policy "delete members" on public.members for delete to authenticated using (public.has_permission(auth.uid(), 'delete_member'));

-- finance
create policy "view finance" on public.financial_transactions for select to authenticated using (public.has_permission(auth.uid(), 'view_finance'));
create policy "create tx" on public.financial_transactions for insert to authenticated with check (public.has_permission(auth.uid(), 'create_financial_transaction'));
create policy "edit tx" on public.financial_transactions for update to authenticated using (public.has_permission(auth.uid(), 'edit_financial_transaction'));
create policy "delete tx" on public.financial_transactions for delete to authenticated using (public.has_permission(auth.uid(), 'delete_financial_transaction'));
create policy "view goals" on public.financial_goals for select to authenticated using (public.has_permission(auth.uid(), 'view_finance'));
create policy "create goals" on public.financial_goals for insert to authenticated with check (public.has_permission(auth.uid(), 'create_financial_goal'));
create policy "edit goals" on public.financial_goals for update to authenticated using (public.has_permission(auth.uid(), 'edit_financial_goal'));
create policy "delete goals" on public.financial_goals for delete to authenticated using (public.has_permission(auth.uid(), 'edit_financial_goal'));

-- new user: profile + role (first user = CEO)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.email);
  if not exists (select 1 from public.user_roles where role = 'ceo') then
    insert into public.user_roles (user_id, role) values (new.id, 'ceo');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'member');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();