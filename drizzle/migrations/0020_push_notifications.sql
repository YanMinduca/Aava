-- Notificações push (celular e computador), mesmo com o site fechado.
-- O navegador assina o push; o envio é feito pela função de borda "push" (supabase/functions/push).

create extension if not exists pg_net with schema extensions;

-- Eventos: guarda se já avisamos que foi publicado (publicar/despublicar de novo não repete o aviso).
alter table public.events add column if not exists notified_at timestamptz;
update public.events set notified_at = now() where published and notified_at is null;

-- ---------------------------------------------------------------------------------------------
-- Configuração do envio (chaves VAPID geradas pela própria função na 1ª vez). Só a função de borda lê.
create table if not exists public.push_config (
  id boolean primary key default true check (id),
  public_key text,
  private_key text,
  subject text not null,
  functions_url text not null,
  webhook_secret text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;
insert into public.push_config (subject, functions_url, webhook_secret)
values (
  'https://mzqdsfadkaviwaazdwlx.supabase.co',
  'https://mzqdsfadkaviwaazdwlx.supabase.co/functions/v1/push',
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
) on conflict (id) do nothing;

-- Aparelhos que aceitaram receber notificações (um usuário pode ter vários: celular, PC...).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke insert, update on public.push_subscriptions from authenticated;
drop policy if exists "push subs own read" on public.push_subscriptions;
create policy "push subs own read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "push subs own delete" on public.push_subscriptions;
create policy "push subs own delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Histórico dos avisos enviados.
create table if not exists public.push_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'manual' check (kind in ('manual', 'auto')),
  title text not null,
  body text not null default '',
  url text,
  audience jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  recipients int not null default 0,
  devices int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists push_notifications_created_idx on public.push_notifications (created_at desc);
alter table public.push_notifications enable row level security;
revoke all on public.push_notifications from anon;
revoke insert, update, delete on public.push_notifications from authenticated;
drop policy if exists "push log read" on public.push_notifications;
create policy "push log read" on public.push_notifications for select to authenticated
  using (public.has_permission(auth.uid(), 'send_push'));

-- ---------------------------------------------------------------------------------------------
-- O aparelho registra (ou renova) a própria assinatura. O mesmo aparelho pode trocar de dono (outro login).
create or replace function public.save_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if _endpoint !~ '^https://' or length(_endpoint) > 2000 or coalesce(_p256dh, '') = '' or coalesce(_auth, '') = '' then
    raise exception 'invalid_subscription';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, last_seen_at = now();
end $$;

create or replace function public.delete_push_subscription(_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = _endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Quem recebe: todos os aparelhos | membros | departamento | liderança | quem tem alguma permissão | cargos | um usuário.
create or replace function public.push_audience_users(_aud jsonb)
returns table (user_id uuid) language plpgsql stable security definer set search_path = public as $$
declare t text := _aud ->> 'type';
begin
  if t = 'all' then
    return query select distinct s.user_id from public.push_subscriptions s;
  elsif t = 'members' then
    return query select distinct m.user_id from public.members m
      where m.user_id is not null and m.approval_status = 'aprovado' and m.status <> 'visitante';
  elsif t = 'department' then
    return query select distinct m.user_id from public.department_members dm
      join public.members m on m.id = dm.member_id
      where dm.department_id = (_aud ->> 'id')::uuid and m.user_id is not null;
  elsif t = 'leadership' then
    return query select ur.user_id from public.user_roles ur where ur.role in ('ceo', 'pastor_presidente');
  elsif t = 'permission' then
    return query
      select ur.user_id from public.user_roles ur where ur.role in ('ceo', 'pastor_presidente')
      union
      select up.user_id from public.user_permissions up
      where up.permission in (select jsonb_array_elements_text(_aud -> 'permissions'));
  elsif t = 'roles' then
    return query select distinct ur.user_id from public.user_roles ur
      where ur.role::text in (select jsonb_array_elements_text(_aud -> 'roles'));
  elsif t = 'user' then
    return query select (_aud ->> 'id')::uuid;
  end if;
end $$;
revoke all on function public.push_audience_users(jsonb) from public, anon, authenticated;
grant execute on function public.push_audience_users(jsonb) to service_role;

-- Dispara um aviso automático (assíncrono, depois do commit). Nunca pode quebrar a operação que o originou.
create or replace function public.push_notify(_aud jsonb, _title text, _body text, _url text, _tag text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cfg record;
begin
  select c.functions_url, c.webhook_secret into cfg from public.push_config c where c.id;
  if cfg.functions_url is null then return; end if;
  perform net.http_post(
    url := cfg.functions_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.webhook_secret),
    body := jsonb_build_object('action', 'dispatch', 'audience', _aud, 'title', _title, 'body', coalesce(_body, ''), 'url', _url, 'tag', _tag),
    timeout_milliseconds := 5000
  );
exception when others then
  null;
end $$;
revoke all on function public.push_notify(jsonb, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Avisos automáticos
-- 1) Novo evento publicado -> todos os aparelhos cadastrados.
create or replace function public.trg_push_event_published() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.published and new.notified_at is null then
    new.notified_at := now();
    if new.starts_at > now() then
      perform public.push_notify(
        jsonb_build_object('type', 'all'),
        'Novo evento: ' || new.title,
        to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24"h"MI')
          || coalesce(' · ' || nullif(btrim(new.location), ''), ''),
        '/eventos/' || new.slug,
        'evento-' || new.id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists push_event_published on public.events;
create trigger push_event_published before insert or update of published on public.events
  for each row execute function public.trg_push_event_published();

-- 2) Alguém avisou que pagou -> quem confere pagamentos.
create or replace function public.trg_push_payment_claimed() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; ev_title text; ev_id uuid;
begin
  select r.attendee_name, e.title, e.id into who, ev_title, ev_id
    from public.event_registrations r join public.events e on e.id = r.event_id where r.id = new.registration_id;
  perform public.push_notify(
    jsonb_build_object('type', 'permission', 'permissions', jsonb_build_array('verify_event_payments', 'manage_events')),
    'Pagamento para conferir',
    coalesce(who, 'Uma inscrição') || ' · ' || coalesce(ev_title, 'evento'),
    '/painel/evento/' || ev_id,
    'pagamento-' || new.id);
  return null;
end $$;
drop trigger if exists push_payment_claimed on public.event_payments;
create trigger push_payment_claimed after update of status on public.event_payments
  for each row when (new.status = 'claimed' and old.status is distinct from 'claimed')
  execute function public.trg_push_payment_claimed();

-- 3) Novo cadastro aguardando aprovação -> quem aprova cadastros.
create or replace function public.trg_push_member_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify(
    jsonb_build_object('type', 'permission', 'permissions', jsonb_build_array('approve_member')),
    'Novo cadastro para aprovar', new.full_name, '/painel/membros', 'cadastro-' || new.id);
  return null;
end $$;
drop trigger if exists push_member_pending on public.members;
create trigger push_member_pending after insert on public.members
  for each row when (new.approval_status = 'pendente') execute function public.trg_push_member_pending();

-- 4) Novo pedido de oração -> liderança e administradores (sem o texto do pedido na notificação).
create or replace function public.trg_push_prayer_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notify(
    jsonb_build_object('type', 'roles', 'roles', jsonb_build_array('ceo', 'pastor_presidente', 'admin')),
    'Novo pedido de oração', 'Abra o painel para ler.', '/painel/oracao', 'oracao-' || new.id);
  return null;
end $$;
drop trigger if exists push_prayer_created on public.prayer_requests;
create trigger push_prayer_created after insert on public.prayer_requests
  for each row execute function public.trg_push_prayer_created();
