-- Escalas dos departamentos.
-- Só o líder do departamento (e a liderança da igreja: CEO/pastor presidente) cria e altera a escala.
-- Os voluntários do departamento veem, dão "Estou ciente" ou pedem alteração com motivo.
-- Todas as gravações passam por funções (RPC): o banco é quem decide, o site só mostra/esconde botões.

create or replace function public.today_br() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Um "dia de escala" = um culto de um departamento numa data (pode haver mais de um culto no mesmo dia).
create table if not exists public.dept_shifts (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  shift_date date not null,
  service_name text not null check (length(btrim(service_name)) between 1 and 80),
  service_time time,
  notes text check (notes is null or length(notes) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dept_shifts_slot_key
  on public.dept_shifts (department_id, shift_date, coalesce(service_time, time '00:00'));
create index if not exists dept_shifts_date_idx on public.dept_shifts (shift_date);

-- Quem está escalado, e como respondeu (pending = aguardando ciente | confirmed = ciente | change_requested = pediu alteração).
create table if not exists public.dept_shift_members (
  shift_id uuid not null references public.dept_shifts(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'change_requested')),
  acknowledged_at timestamptz,
  change_reason text check (change_reason is null or length(change_reason) between 5 and 300),
  change_requested_at timestamptz,
  leader_note text check (leader_note is null or length(leader_note) <= 300),
  primary key (shift_id, member_id)
);
create index if not exists dept_shift_members_member_idx on public.dept_shift_members (member_id);

-- ---------------------------------------------------------------------------------------------
-- Permissões
create or replace function public.can_manage_shifts(_user uuid, _dept uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _user is not null and (
    public.is_church_leadership(_user)
    or exists (
      select 1 from public.department_leaders dl join public.members m on m.id = dl.member_id
      where dl.department_id = _dept and m.user_id = _user)
  )
$$;

create or replace function public.can_see_shifts(_user uuid, _dept uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _user is not null and (
    public.can_manage_shifts(_user, _dept)
    or public.can_view_department(_user, _dept)
    or exists (
      select 1 from public.department_members dm join public.members m on m.id = dm.member_id
      where dm.department_id = _dept and m.user_id = _user)
  )
$$;

create or replace function public.shift_dept(_shift uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from public.dept_shifts where id = _shift
$$;

alter table public.dept_shifts enable row level security;
alter table public.dept_shift_members enable row level security;
revoke all on public.dept_shifts, public.dept_shift_members from anon;
revoke insert, update, delete on public.dept_shifts, public.dept_shift_members from authenticated;
drop policy if exists "shifts read" on public.dept_shifts;
create policy "shifts read" on public.dept_shifts for select to authenticated
  using (public.can_see_shifts(auth.uid(), department_id));
drop policy if exists "shift members read" on public.dept_shift_members;
create policy "shift members read" on public.dept_shift_members for select to authenticated
  using (public.can_see_shifts(auth.uid(), public.shift_dept(shift_id)));

-- Quem sai do departamento deixa as escalas futuras dele.
create or replace function public.trg_dept_member_left_shifts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.dept_shift_members sm using public.dept_shifts s
   where sm.shift_id = s.id and s.department_id = old.department_id
     and sm.member_id = old.member_id and s.shift_date >= public.today_br();
  return old;
end $$;
drop trigger if exists dept_member_left_shifts on public.department_members;
create trigger dept_member_left_shifts after delete on public.department_members
  for each row execute function public.trg_dept_member_left_shifts();

-- ---------------------------------------------------------------------------------------------
-- Textos e avisos (push)
create or replace function public.shift_label(_service text, _date date, _time time) returns text
language sql stable set search_path = public as $$
  select _service || ' · '
    || (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow from _date)::int + 1]
    || ' ' || to_char(_date, 'DD/MM')
    || case when _time is not null and _time <> time '00:00' then ' às ' || to_char(_time, 'HH24"h"MI') else '' end
$$;

create or replace function public.shift_push(_member uuid, _title text, _body text, _tag text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select m.user_id into uid from public.members m where m.id = _member;
  if uid is not null then
    perform public.push_notify(jsonb_build_object('type', 'user', 'id', uid), _title, _body, '/painel', _tag);
  end if;
end $$;

create or replace function public.shift_push_leaders(_dept uuid, _title text, _body text, _tag text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select m.user_id from public.department_leaders dl join public.members m on m.id = dl.member_id
           where dl.department_id = _dept and m.user_id is not null loop
    perform public.push_notify(jsonb_build_object('type', 'user', 'id', r.user_id), _title, _body, '/painel/escalas', _tag);
  end loop;
end $$;

revoke all on function public.shift_push(uuid, text, text, text), public.shift_push_leaders(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Leitura
create or replace function public.shift_departments()
returns table (id uuid, name text, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, public.can_manage_shifts(auth.uid(), d.id)
  from public.departments d where public.can_see_shifts(auth.uid(), d.id) order by d.name
$$;

create or replace function public.dept_schedule(_dept uuid, _from date, _to date)
returns table (
  shift_id uuid, shift_date date, service_name text, service_time time, notes text,
  member_id uuid, member_name text, has_account boolean, status text, acknowledged_at timestamptz,
  change_reason text, change_requested_at timestamptz, leader_note text, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); mgr boolean;
begin
  if not public.can_see_shifts(uid, _dept) then raise exception 'forbidden'; end if;
  mgr := public.can_manage_shifts(uid, _dept);
  return query
    select s.id, s.shift_date, s.service_name, s.service_time, s.notes,
           m.id, m.full_name, (m.user_id is not null), sm.status, sm.acknowledged_at,
           case when mgr or m.user_id = uid then sm.change_reason end,
           sm.change_requested_at,
           case when mgr or m.user_id = uid then sm.leader_note end,
           coalesce(m.user_id = uid, false)
    from public.dept_shifts s
    left join public.dept_shift_members sm on sm.shift_id = s.id
    left join public.members m on m.id = sm.member_id
    where s.department_id = _dept and s.shift_date between _from and _to
    order by s.shift_date, coalesce(s.service_time, time '00:00'), s.service_name, m.full_name;
end $$;

-- Próximas escalas da própria pessoa (dashboard e "Minhas escalas").
create or replace function public.my_shifts(_limit int default 20)
returns table (
  shift_id uuid, department_id uuid, department_name text, shift_date date, service_name text, service_time time,
  notes text, status text, change_reason text, leader_note text, team text[]
)
language sql stable security definer set search_path = public as $$
  select s.id, s.department_id, d.name, s.shift_date, s.service_name, s.service_time, s.notes,
         sm.status, sm.change_reason, sm.leader_note,
         coalesce((select array_agg(m2.full_name order by m2.full_name)
                   from public.dept_shift_members sm2 join public.members m2 on m2.id = sm2.member_id
                   where sm2.shift_id = s.id and sm2.member_id <> sm.member_id), '{}'::text[])
  from public.dept_shift_members sm
  join public.members me on me.id = sm.member_id and me.user_id = auth.uid()
  join public.dept_shifts s on s.id = sm.shift_id
  join public.departments d on d.id = s.department_id
  where s.shift_date >= public.today_br()
  order by s.shift_date, coalesce(s.service_time, time '00:00')
  limit greatest(1, least(coalesce(_limit, 20), 100))
$$;

-- Voluntários que o líder pode escalar (aprovados no departamento) e quantas vezes já estão escalados no mês.
create or replace function public.shift_candidates(_dept uuid, _date date, _exclude uuid default null)
returns table (member_id uuid, full_name text, has_account boolean, month_count int)
language plpgsql stable security definer set search_path = public as $$
declare mstart date := date_trunc('month', _date)::date;
begin
  if not public.can_manage_shifts(auth.uid(), _dept) then raise exception 'forbidden'; end if;
  return query
    select m.id, m.full_name, (m.user_id is not null),
           (select count(*)::int from public.dept_shift_members sm2 join public.dept_shifts s2 on s2.id = sm2.shift_id
             where sm2.member_id = m.id and s2.shift_date >= mstart and s2.shift_date < (mstart + interval '1 month')::date
               and (_exclude is null or s2.id <> _exclude))
    from public.department_members dm join public.members m on m.id = dm.member_id
    where dm.department_id = _dept and m.approval_status = 'aprovado'
    order by m.full_name;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Avisos para o líder (NÃO bloqueiam): culto seguido, mesmo culto em dois departamentos, mais de 3 escalas no mês.
-- "Culto seguido" = o culto imediatamente anterior ou seguinte que já tem escala (de qualquer departamento).
create or replace function public.shift_warnings(_dept uuid, _date date, _time time, _members uuid[], _exclude uuid default null)
returns table (member_id uuid, kind text, detail text, total int)
language plpgsql stable security definer set search_path = public as $$
declare
  t time := coalesce(_time, time '00:00');
  prev_d date; prev_t time; next_d date; next_t time;
  mstart date := date_trunc('month', _date)::date;
  months text[] := array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
begin
  if not public.can_manage_shifts(auth.uid(), _dept) then raise exception 'forbidden'; end if;

  select s.shift_date, coalesce(s.service_time, time '00:00') into prev_d, prev_t
    from public.dept_shifts s
    where (_exclude is null or s.id <> _exclude)
      and (s.shift_date, coalesce(s.service_time, time '00:00')) < (_date, t)
    order by s.shift_date desc, coalesce(s.service_time, time '00:00') desc limit 1;
  select s.shift_date, coalesce(s.service_time, time '00:00') into next_d, next_t
    from public.dept_shifts s
    where (_exclude is null or s.id <> _exclude)
      and (s.shift_date, coalesce(s.service_time, time '00:00')) > (_date, t)
    order by s.shift_date, coalesce(s.service_time, time '00:00') limit 1;

  return query
    -- mesmo culto em outro departamento
    select distinct sm.member_id, 'double'::text,
           'já está escalado neste mesmo culto em outro departamento'::text, null::int
      from public.dept_shift_members sm join public.dept_shifts s on s.id = sm.shift_id
     where sm.member_id = any(coalesce(_members, '{}')) and s.shift_date = _date
       and coalesce(s.service_time, time '00:00') = t and (_exclude is null or s.id <> _exclude)
    union all
    -- culto anterior
    select distinct sm.member_id, 'consecutive'::text,
           ('também está escalado no culto anterior (' || to_char(prev_d, 'DD/MM')
             || case when prev_t <> time '00:00' then ' às ' || to_char(prev_t, 'HH24"h"MI') else '' end || ')')::text, null::int
      from public.dept_shift_members sm join public.dept_shifts s on s.id = sm.shift_id
     where prev_d is not null and sm.member_id = any(coalesce(_members, '{}')) and s.shift_date = prev_d
       and coalesce(s.service_time, time '00:00') = prev_t and (_exclude is null or s.id <> _exclude)
    union all
    -- culto seguinte
    select distinct sm.member_id, 'consecutive'::text,
           ('também está escalado no culto seguinte (' || to_char(next_d, 'DD/MM')
             || case when next_t <> time '00:00' then ' às ' || to_char(next_t, 'HH24"h"MI') else '' end || ')')::text, null::int
      from public.dept_shift_members sm join public.dept_shifts s on s.id = sm.shift_id
     where next_d is not null and sm.member_id = any(coalesce(_members, '{}')) and s.shift_date = next_d
       and coalesce(s.service_time, time '00:00') = next_t and (_exclude is null or s.id <> _exclude)
    union all
    -- mais de 3 escalas no mês (contando esta)
    select c.mid, 'monthly'::text,
           ('ficará com ' || (c.cnt + 1) || ' escalas em ' || months[extract(month from _date)::int] || ' (somando todos os departamentos)')::text,
           (c.cnt + 1)::int
      from (select x.mid,
                   (select count(*) from public.dept_shift_members sm2 join public.dept_shifts s2 on s2.id = sm2.shift_id
                     where sm2.member_id = x.mid and s2.shift_date >= mstart
                       and s2.shift_date < (mstart + interval '1 month')::date
                       and (_exclude is null or s2.id <> _exclude)) as cnt
              from unnest(coalesce(_members, '{}')) x(mid)) c
     where c.cnt + 1 > 3;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Gravação (só o líder)
create or replace function public.save_shift(
  _dept uuid, _date date, _service_name text, _service_time time, _member_ids uuid[],
  _notes text default null, _shift_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid := _shift_id;
  cur public.dept_shifts%rowtype;
  ids uuid[] := coalesce(_member_ids, '{}');
  dname text; lbl text; changed_slot boolean := false; r record;
  svc text := btrim(coalesce(_service_name, ''));
begin
  if not public.can_manage_shifts(uid, _dept) then raise exception 'forbidden'; end if;
  if _date is null or svc = '' or length(svc) > 80 then raise exception 'invalid_shift'; end if;
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'no_members'; end if;
  if _date < public.today_br() then raise exception 'shift_past'; end if;
  if exists (
    select 1 from unnest(ids) x(mid) where not exists (
      select 1 from public.department_members dm join public.members m on m.id = dm.member_id
      where dm.department_id = _dept and dm.member_id = x.mid and m.approval_status = 'aprovado')
  ) then raise exception 'invalid_member'; end if;

  select d.name into dname from public.departments d where d.id = _dept;
  lbl := public.shift_label(svc, _date, _service_time);

  if sid is null then
    begin
      insert into public.dept_shifts (department_id, shift_date, service_name, service_time, notes, created_by)
      values (_dept, _date, svc, _service_time, nullif(btrim(_notes), ''), uid) returning id into sid;
    exception when unique_violation then raise exception 'shift_exists'; end;
  else
    select * into cur from public.dept_shifts s where s.id = sid and s.department_id = _dept for update;
    if not found then raise exception 'shift_not_found'; end if;
    if cur.shift_date < public.today_br() then raise exception 'shift_past'; end if;
    changed_slot := (cur.shift_date, coalesce(cur.service_time, time '00:00'))
                    is distinct from (_date, coalesce(_service_time, time '00:00'));
    begin
      update public.dept_shifts
         set shift_date = _date, service_name = svc, service_time = _service_time,
             notes = nullif(btrim(_notes), ''), updated_at = now()
       where id = sid;
    exception when unique_violation then raise exception 'shift_exists'; end;
  end if;

  -- saíram da escala
  for r in select sm.member_id from public.dept_shift_members sm where sm.shift_id = sid and not (sm.member_id = any(ids)) loop
    delete from public.dept_shift_members where shift_id = sid and member_id = r.member_id;
    perform public.shift_push(r.member_id, 'Escala atualizada', 'Você não está mais escalado: ' || dname || ' · ' || lbl, 'escala-' || sid);
  end loop;

  -- mudou a data/horário: quem já estava precisa dar ciente de novo
  if changed_slot then
    update public.dept_shift_members
       set status = 'pending', acknowledged_at = null, change_reason = null, change_requested_at = null, leader_note = null
     where shift_id = sid and member_id = any(ids);
    for r in select sm.member_id from public.dept_shift_members sm where sm.shift_id = sid loop
      perform public.shift_push(r.member_id, 'Escala alterada', dname || ' · ' || lbl, 'escala-' || sid);
    end loop;
  end if;

  -- entraram agora
  for r in select x.mid from unnest(ids) x(mid)
           where not exists (select 1 from public.dept_shift_members sm where sm.shift_id = sid and sm.member_id = x.mid) loop
    insert into public.dept_shift_members (shift_id, member_id) values (sid, r.mid);
    perform public.shift_push(r.mid, 'Você foi escalado', dname || ' · ' || lbl, 'escala-' || sid);
  end loop;

  return sid;
end $$;

create or replace function public.delete_shift(_shift uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.dept_shifts%rowtype; dname text; r record;
begin
  select * into s from public.dept_shifts x where x.id = _shift;
  if not found then return; end if;
  if not public.can_manage_shifts(auth.uid(), s.department_id) then raise exception 'forbidden'; end if;
  if s.shift_date >= public.today_br() then
    select d.name into dname from public.departments d where d.id = s.department_id;
    for r in select sm.member_id from public.dept_shift_members sm where sm.shift_id = _shift loop
      perform public.shift_push(r.member_id, 'Escala cancelada', dname || ' · ' || public.shift_label(s.service_name, s.shift_date, s.service_time), 'escala-' || _shift);
    end loop;
  end if;
  delete from public.dept_shifts where id = _shift;
end $$;

-- Voluntário: "Estou ciente"
create or replace function public.ack_shift(_shift uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.dept_shift_members sm
     set status = 'confirmed', acknowledged_at = now(), change_reason = null, change_requested_at = null
    from public.dept_shifts s, public.members m
   where sm.shift_id = _shift and s.id = sm.shift_id and m.id = sm.member_id
     and m.user_id = auth.uid() and s.shift_date >= public.today_br();
  if not found then raise exception 'shift_not_found'; end if;
end $$;

-- Voluntário: pedir alteração (motivo obrigatório); avisa os líderes.
create or replace function public.request_shift_change(_shift uuid, _reason text) returns void
language plpgsql security definer set search_path = public as $$
declare why text := btrim(coalesce(_reason, '')); who text; s public.dept_shifts%rowtype; mid uuid;
begin
  if length(why) < 5 or length(why) > 300 then raise exception 'invalid_reason'; end if;
  select m.id, m.full_name into mid, who from public.members m where m.user_id = auth.uid();
  select * into s from public.dept_shifts x where x.id = _shift and x.shift_date >= public.today_br();
  if mid is null or s.id is null then raise exception 'shift_not_found'; end if;
  update public.dept_shift_members
     set status = 'change_requested', change_reason = why, change_requested_at = now(), acknowledged_at = null, leader_note = null
   where shift_id = _shift and member_id = mid;
  if not found then raise exception 'shift_not_found'; end if;
  perform public.shift_push_leaders(s.department_id, 'Pedido de alteração de escala',
    who || ' · ' || public.shift_label(s.service_name, s.shift_date, s.service_time), 'pedido-' || _shift || '-' || mid);
end $$;

-- Líder: mantém a pessoa na escala (resposta opcional) ou marca o ciente por ela (quem não tem conta).
create or replace function public.resolve_shift_change(_shift uuid, _member uuid, _note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s public.dept_shifts%rowtype; note text := nullif(btrim(coalesce(_note, '')), '');
begin
  select * into s from public.dept_shifts x where x.id = _shift;
  if not found or not public.can_manage_shifts(auth.uid(), s.department_id) then raise exception 'forbidden'; end if;
  update public.dept_shift_members
     set status = 'pending', change_reason = null, change_requested_at = null, acknowledged_at = null, leader_note = left(note, 300)
   where shift_id = _shift and member_id = _member and status = 'change_requested';
  if found then
    perform public.shift_push(_member, 'O líder manteve sua escala',
      public.shift_label(s.service_name, s.shift_date, s.service_time) || coalesce(' · ' || note, ''), 'escala-' || _shift);
  end if;
end $$;

create or replace function public.leader_confirm_shift(_shift uuid, _member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s public.dept_shifts%rowtype;
begin
  select * into s from public.dept_shifts x where x.id = _shift;
  if not found or not public.can_manage_shifts(auth.uid(), s.department_id) then raise exception 'forbidden'; end if;
  update public.dept_shift_members
     set status = 'confirmed', acknowledged_at = now(), change_reason = null, change_requested_at = null
   where shift_id = _shift and member_id = _member;
end $$;

revoke all on function
  public.can_manage_shifts(uuid, uuid), public.can_see_shifts(uuid, uuid), public.shift_dept(uuid),
  public.shift_departments(), public.dept_schedule(uuid, date, date), public.my_shifts(int),
  public.shift_candidates(uuid, date, uuid), public.shift_warnings(uuid, date, time, uuid[], uuid),
  public.save_shift(uuid, date, text, time, uuid[], text, uuid), public.delete_shift(uuid),
  public.ack_shift(uuid), public.request_shift_change(uuid, text),
  public.resolve_shift_change(uuid, uuid, text), public.leader_confirm_shift(uuid, uuid)
from public, anon;
grant execute on function
  public.can_manage_shifts(uuid, uuid), public.can_see_shifts(uuid, uuid), public.shift_dept(uuid),
  public.shift_departments(), public.dept_schedule(uuid, date, date), public.my_shifts(int),
  public.shift_candidates(uuid, date, uuid), public.shift_warnings(uuid, date, time, uuid[], uuid),
  public.save_shift(uuid, date, text, time, uuid[], text, uuid), public.delete_shift(uuid),
  public.ack_shift(uuid), public.request_shift_change(uuid, text),
  public.resolve_shift_change(uuid, uuid, text), public.leader_confirm_shift(uuid, uuid)
to authenticated, service_role;
