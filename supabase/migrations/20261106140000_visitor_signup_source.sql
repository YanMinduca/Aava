-- Origem do cadastro de visitantes ("veio pelo evento X").
--
-- Só ACRESCENTA colunas e gatilhos. Não apaga nem altera dados existentes; a única escrita em dados
-- antigos é preencher a origem dos visitantes que já têm inscrição em evento.
--
-- signup_source: 'event' (visitante criado pela inscrição em evento), 'admin' (cadastrado pela equipe)
--                ou 'site' (cadastro feito pela própria pessoa). Nulo = origem não registrada.
-- signup_event_id / signup_event_title: evento da primeira inscrição (o título fica guardado mesmo se
--                o evento for apagado depois).

alter table public.members
  add column if not exists signup_source text
    check (signup_source is null or signup_source in ('event', 'admin', 'site')),
  add column if not exists signup_event_id uuid references public.events(id) on delete set null,
  add column if not exists signup_event_title text;

comment on column public.members.signup_source is 'Como o cadastro nasceu: event, admin ou site. Nulo = não registrado.';
comment on column public.members.signup_event_id is 'Evento da primeira inscrição do visitante (some se o evento for apagado).';
comment on column public.members.signup_event_title is 'Título do evento da primeira inscrição, guardado para o histórico.';

-- Novo cadastro: define a origem. Ninguém escolhe a origem pelo navegador.
-- (Sem usuário logado, como em migrations e na chave de serviço, o valor é mantido como veio.)
create or replace function public.members_signup_source_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if current_setting('app.event_visitor', true) = 'on' then
    new.signup_source := 'event';
  elsif public.has_permission(auth.uid(), 'create_member') then
    new.signup_source := 'admin';
  else
    new.signup_source := 'site';
  end if;
  new.signup_event_id := null;
  new.signup_event_title := null;
  return new;
end $$;

drop trigger if exists members_signup_source_defaults on public.members;
create trigger members_signup_source_defaults before insert on public.members
  for each row execute function public.members_signup_source_defaults();

-- Edição de cadastro: a origem não muda pelo navegador (nem quando a tela salva a ficha inteira).
-- Passam: o gatilho de inscrição (que liga app.signup_source), migrations/chave de serviço (sem usuário)
-- e ações internas do banco (profundidade de gatilho > 1, como o "ao apagar evento, zera o vínculo").
create or replace function public.members_signup_source_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and pg_trigger_depth() <= 1
     and current_setting('app.signup_source', true) is distinct from 'on' then
    new.signup_source := old.signup_source;
    new.signup_event_id := old.signup_event_id;
    new.signup_event_title := old.signup_event_title;
  end if;
  return new;
end $$;

drop trigger if exists members_signup_source_lock on public.members;
create trigger members_signup_source_lock before update on public.members
  for each row execute function public.members_signup_source_lock();

-- Primeira inscrição em evento de um visitante: grava de qual evento ele veio.
-- Nunca bloqueia a inscrição: se algo falhar, só emite um aviso.
create or replace function public.event_registration_signup_source()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.member_id is not null then
    begin
      perform set_config('app.signup_source', 'on', true);
      update public.members m
         set signup_source = 'event',
             signup_event_id = new.event_id,
             signup_event_title = (select e.title from public.events e where e.id = new.event_id)
       where m.id = new.member_id
         and m.status = 'visitante'
         and (m.signup_source is null or m.signup_source = 'event')
         and m.signup_event_title is null;
      perform set_config('app.signup_source', 'off', true);
    exception when others then
      perform set_config('app.signup_source', 'off', true);
      raise warning 'signup_source (event_registrations): %', sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists event_registration_signup_source on public.event_registrations;
create trigger event_registration_signup_source after insert on public.event_registrations
  for each row execute function public.event_registration_signup_source();

-- Gatilhos não precisam ficar chamáveis de fora.
revoke all on function
  public.members_signup_source_defaults(),
  public.members_signup_source_lock(),
  public.event_registration_signup_source()
  from public, anon, authenticated;

-- Visitantes que já existem e já têm inscrição: origem = evento da primeira inscrição.
-- O gatilho members_guard é pausado só aqui para não mexer em updated_at (mesmo cuidado de migrations anteriores).
alter table public.members disable trigger members_guard;

update public.members m
   set signup_source = 'event',
       signup_event_id = fr.event_id,
       signup_event_title = fr.title
  from (
    select distinct on (r.member_id) r.member_id, r.event_id, e.title
      from public.event_registrations r
      join public.events e on e.id = r.event_id
     order by r.member_id, r.created_at
  ) fr
 where m.id = fr.member_id
   and m.status = 'visitante'
   and m.signup_source is null;

alter table public.members enable trigger members_guard;
