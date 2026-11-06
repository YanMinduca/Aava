-- Histórico de atividade de membros: novos membros, contas criadas e contas vinculadas.
-- Guarda só IDs (nomes/e-mails vêm por join), então tudo some junto quando o membro ou a conta é apagado.
create table if not exists public.member_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('member_created', 'account_created', 'account_linked')),
  member_id uuid references public.members(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists member_activity_created_idx on public.member_activity (created_at desc);

alter table public.member_activity enable row level security;

-- Só quem pode ver membros lê; ninguém escreve pelo front-end (só os gatilhos abaixo).
drop policy if exists "view member activity" on public.member_activity;
create policy "view member activity" on public.member_activity
  for select to authenticated
  using (public.has_permission(auth.uid(), 'view_members'));

revoke all on public.member_activity from anon, authenticated;
grant select on public.member_activity to authenticated;

-- Gatilho em members: novo membro e conta vinculada.
-- O bloco de exceção garante que o registro do histórico NUNCA bloqueia o cadastro de membros.
create or replace function public.trg_member_activity_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.member_activity (kind, member_id, user_id)
      values ('member_created', new.id, new.user_id);
      if new.user_id is not null then
        insert into public.member_activity (kind, member_id, user_id)
        values ('account_linked', new.id, new.user_id);
      end if;
    elsif tg_op = 'UPDATE' and old.user_id is null and new.user_id is not null then
      insert into public.member_activity (kind, member_id, user_id)
      values ('account_linked', new.id, new.user_id);
    end if;
  exception when others then
    raise warning 'member_activity (members): %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists member_activity_member on public.members;
create trigger member_activity_member
  after insert or update of user_id on public.members
  for each row execute function public.trg_member_activity_member();

-- Gatilho em profiles: conta criada. Também nunca pode bloquear o cadastro de contas.
create or replace function public.trg_member_activity_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.member_activity (kind, user_id) values ('account_created', new.id);
  exception when others then
    raise warning 'member_activity (profiles): %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists member_activity_profile on public.profiles;
create trigger member_activity_profile
  after insert on public.profiles
  for each row execute function public.trg_member_activity_profile();

-- Histórico já existente (usa as datas originais).
insert into public.member_activity (kind, member_id, created_at)
select 'member_created', m.id, coalesce(m.created_at, now()) from public.members m;

insert into public.member_activity (kind, user_id, created_at)
select 'account_created', p.id, coalesce(p.created_at, now()) from public.profiles p;

insert into public.member_activity (kind, member_id, user_id, created_at)
select 'account_linked', m.id, m.user_id,
  coalesce(
    (select max(a.created_at) from public.member_claim_attempts a
      where a.member_id = m.id and a.user_id = m.user_id and a.kind = 'claim' and a.success),
    p.created_at,
    now())
from public.members m
left join public.profiles p on p.id = m.user_id
where m.user_id is not null;

-- Função que o painel chama. Só devolve dados para quem tem a permissão view_members.
create or replace function public.member_activity_feed(_limit int default 30, _before timestamptz default null)
returns table (
  id uuid,
  kind text,
  created_at timestamptz,
  member_id uuid,
  member_name text,
  user_id uuid,
  account_email text,
  account_name text,
  account_linked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'view_members') then
    raise exception 'Acesso negado';
  end if;
  return query
  select a.id, a.kind, a.created_at, a.member_id, m.full_name, a.user_id, p.email, p.full_name,
         (a.user_id is not null and exists (select 1 from public.members mm where mm.user_id = a.user_id))
  from public.member_activity a
  left join public.members m on m.id = a.member_id
  left join public.profiles p on p.id = a.user_id
  where (_before is null or a.created_at < _before)
  order by a.created_at desc
  limit least(greatest(coalesce(_limit, 30), 1), 100);
end $$;

revoke all on function public.member_activity_feed(int, timestamptz) from public, anon;
grant execute on function public.member_activity_feed(int, timestamptz) to authenticated;
