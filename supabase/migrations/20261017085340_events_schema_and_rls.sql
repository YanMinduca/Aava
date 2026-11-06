create or replace function public.is_valid_cpf(_cpf text)
returns boolean language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'); s int; i int; r int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  published boolean not null default false,
  audience text not null default 'public' check (audience in ('public', 'members')),
  payment_enabled boolean not null default false,
  accepts_card boolean not null default false,
  allow_installments boolean not null default false,
  max_installments int not null default 1 check (max_installments between 1 and 12),
  limit_per_person boolean not null default false,
  max_per_person int check (max_per_person is null or max_per_person >= 1),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists events_slug_key on public.events (lower(slug));

create table if not exists public.event_lots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  position int not null default 0,
  price numeric(12,2) not null default 0 check (price >= 0),
  capacity int check (capacity is null or capacity >= 0),
  public_access boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_lots_event_idx on public.event_lots (event_id);

create table if not exists public.event_payment_info (
  event_id uuid primary key references public.events(id) on delete cascade,
  payment_link text,
  pix_key text,
  pix_qr_path text,
  card_contact_note text
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  lot_id uuid not null references public.event_lots(id),
  user_id uuid not null,
  member_id uuid references public.members(id) on delete set null,
  attendee_name text not null,
  attendee_cpf text,
  attendee_phone text,
  attendee_email text,
  quantity int not null check (quantity between 1 and 10),
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null,
  installments int not null default 1,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  released_manually boolean not null default false,
  released_by uuid,
  released_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_registrations_event_idx on public.event_registrations (event_id, status);
create index if not exists event_registrations_user_idx on public.event_registrations (user_id);
create index if not exists event_registrations_lot_idx on public.event_registrations (lot_id) where status <> 'cancelled';

create table if not exists public.event_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  installment_no int not null,
  amount numeric(12,2) not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'paid')),
  proof_path text,
  claimed_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  unique (registration_id, installment_no)
);

create table if not exists public.event_tickets (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  seq int not null,
  code text not null unique,
  holder_name text not null,
  status text not null default 'valid' check (status in ('valid', 'checked_in', 'cancelled')),
  checked_in_at timestamptz,
  checked_in_by uuid,
  created_at timestamptz not null default now(),
  unique (registration_id, seq)
);
create index if not exists event_tickets_event_idx on public.event_tickets (event_id, status);

create or replace function public.has_any_event_permission(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(_user_id, 'manage_events') or public.has_permission(_user_id, 'verify_event_payments') or public.has_permission(_user_id, 'checkin_events');
$$;

create or replace function public.lot_taken(_lot uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(quantity), 0)::int from public.event_registrations where lot_id = _lot and status in ('pending', 'confirmed');
$$;

alter table public.events enable row level security;
alter table public.event_lots enable row level security;
alter table public.event_payment_info enable row level security;
alter table public.event_registrations enable row level security;
alter table public.event_payments enable row level security;
alter table public.event_tickets enable row level security;

drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select to authenticated using (published or public.has_any_event_permission(auth.uid()));
drop policy if exists "events write" on public.events;
create policy "events write" on public.events for all to authenticated
  using (public.has_permission(auth.uid(), 'manage_events')) with check (public.has_permission(auth.uid(), 'manage_events'));

drop policy if exists "event_lots read" on public.event_lots;
create policy "event_lots read" on public.event_lots for select to authenticated using (exists (select 1 from public.events e where e.id = event_id));
drop policy if exists "event_lots write" on public.event_lots;
create policy "event_lots write" on public.event_lots for all to authenticated
  using (public.has_permission(auth.uid(), 'manage_events')) with check (public.has_permission(auth.uid(), 'manage_events'));

drop policy if exists "event_payment_info read" on public.event_payment_info;
create policy "event_payment_info read" on public.event_payment_info for select to authenticated using (
  public.has_permission(auth.uid(), 'manage_events')
  or public.has_permission(auth.uid(), 'verify_event_payments')
  or exists (select 1 from public.event_registrations r where r.event_id = event_payment_info.event_id and r.user_id = auth.uid() and r.status <> 'cancelled'));
drop policy if exists "event_payment_info write" on public.event_payment_info;
create policy "event_payment_info write" on public.event_payment_info for all to authenticated
  using (public.has_permission(auth.uid(), 'manage_events')) with check (public.has_permission(auth.uid(), 'manage_events'));

drop policy if exists "event_registrations read" on public.event_registrations;
create policy "event_registrations read" on public.event_registrations for select to authenticated
  using (user_id = auth.uid() or public.has_any_event_permission(auth.uid()));

drop policy if exists "event_payments read" on public.event_payments;
create policy "event_payments read" on public.event_payments for select to authenticated using (
  public.has_permission(auth.uid(), 'manage_events') or public.has_permission(auth.uid(), 'verify_event_payments')
  or exists (select 1 from public.event_registrations r where r.id = registration_id and r.user_id = auth.uid()));

drop policy if exists "event_tickets read" on public.event_tickets;
create policy "event_tickets read" on public.event_tickets for select to authenticated using (
  public.has_any_event_permission(auth.uid())
  or exists (select 1 from public.event_registrations r where r.id = registration_id and r.user_id = auth.uid()));

revoke all on public.events, public.event_lots, public.event_payment_info, public.event_registrations, public.event_payments, public.event_tickets from anon;
revoke all on public.event_registrations, public.event_payments, public.event_tickets from authenticated;
grant select on public.event_registrations, public.event_payments, public.event_tickets to authenticated;
grant select, insert, update, delete on public.events, public.event_lots, public.event_payment_info to authenticated;
