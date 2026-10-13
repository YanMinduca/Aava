-- Member address fields, baptism church and tithe history.
alter table public.members
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists zip_code text,
  add column if not exists baptism_church text;

create table if not exists public.tithes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  reference_month date,
  payment_method text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists tithes_member_paid_idx on public.tithes (member_id, paid_on desc);
alter table public.tithes enable row level security;

drop policy if exists "tithes view" on public.tithes;
drop policy if exists "tithes create" on public.tithes;
drop policy if exists "tithes edit" on public.tithes;
drop policy if exists "tithes delete" on public.tithes;
drop policy if exists "tithes own read" on public.tithes;

create policy "tithes view" on public.tithes for select to authenticated
  using (public.has_permission(auth.uid(), 'view_finance'));
create policy "tithes create" on public.tithes for insert to authenticated
  with check (public.has_permission(auth.uid(), 'create_financial_transaction'));
create policy "tithes edit" on public.tithes for update to authenticated
  using (public.has_permission(auth.uid(), 'edit_financial_transaction'));
create policy "tithes delete" on public.tithes for delete to authenticated
  using (public.has_permission(auth.uid(), 'delete_financial_transaction'));
create policy "tithes own read" on public.tithes for select to authenticated
  using (exists (select 1 from public.members m where m.id = tithes.member_id and m.user_id = auth.uid()));
