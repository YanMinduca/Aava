-- Remoção de ingressos (1 ou mais) de uma inscrição, sempre com uma observação explicando o motivo.
--
-- A observação fica registrada em event_ticket_removals e a pessoa inscrita a enxerga em "Meu cadastro".
-- Regras (função remove_event_tickets):
--   * Só quem gerencia eventos ou confere pagamentos pode remover (mesma regra de cancelar inscrição).
--   * Inscrição com ingressos emitidos: escolhem-se os ingressos (têm que estar válidos; ingresso com presença confirmada
--     não sai: desfaça a presença antes). Inscrição ainda sem ingressos (aguardando pagamento): informa-se a quantidade.
--   * A quantidade e o total da inscrição diminuem, então as vagas do lote voltam a ficar disponíveis (lot_taken).
--   * Removendo todos os ingressos, a inscrição inteira é cancelada (igual a "Cancelar inscrição", mas com observação).
--   * Parcelas ainda não pagas são recalculadas para o novo total. Se o que já foi pago passa do novo total, as parcelas
--     pendentes saem e o excedente fica registrado em refund_due (a devolução é feita pela igreja, fora do sistema).
-- Idempotente.

create table if not exists public.event_ticket_removals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.event_registrations(id) on delete cascade,
  tickets_removed int not null check (tickets_removed >= 1),
  holder_names text[] not null default '{}',
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  registration_cancelled boolean not null default false,
  refund_due numeric(12,2) not null default 0,
  removed_by uuid,
  removed_at timestamptz not null default now()
);
create index if not exists event_ticket_removals_reg_idx on public.event_ticket_removals (registration_id);
create index if not exists event_ticket_removals_event_idx on public.event_ticket_removals (event_id);

alter table public.event_ticket_removals enable row level security;
drop policy if exists "event_ticket_removals read" on public.event_ticket_removals;
create policy "event_ticket_removals read" on public.event_ticket_removals for select to authenticated using (
  public.has_any_event_permission(auth.uid())
  or exists (select 1 from public.event_registrations r where r.id = registration_id and r.user_id = auth.uid()));
revoke all on public.event_ticket_removals from anon, authenticated;
grant select on public.event_ticket_removals to authenticated;

alter table public.event_tickets
  add column if not exists removal_id uuid references public.event_ticket_removals(id) on delete set null;

create or replace function public.remove_event_tickets(
  _reg uuid, _ticket_ids uuid[], _quantity integer, _reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  r public.event_registrations%rowtype;
  v_reason text := regexp_replace(btrim(coalesce(_reason, '')), '\s+', ' ', 'g');
  has_tickets boolean;
  ids uuid[]; k int; found_n int;
  names text[] := '{}';
  new_qty int; new_total numeric; paid_sum numeric; due numeric; refund numeric;
  unpaid uuid[]; unpaid_n int; base numeric; i int;
  removal uuid; cancel_all boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'verify_event_payments') or public.has_permission(uid, 'manage_events')) then
    raise exception 'Acesso negado';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'invalid_removal_reason'; end if;

  select * into r from public.event_registrations where id = _reg for update;
  if not found then raise exception 'not_found'; end if;
  if r.status = 'cancelled' then raise exception 'registration_cancelled'; end if;

  select exists (select 1 from public.event_tickets where registration_id = _reg) into has_tickets;

  if has_tickets then
    select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(_ticket_ids, '{}')) x;
    k := coalesce(array_length(ids, 1), 0);
    if k = 0 then raise exception 'invalid_removal_selection'; end if;
    select count(*) into found_n from public.event_tickets t where t.registration_id = _reg and t.id = any (ids);
    if found_n <> k then raise exception 'invalid_removal_selection'; end if;
    if exists (select 1 from public.event_tickets t where t.id = any (ids) and t.status = 'checked_in') then
      raise exception 'ticket_checked_in';
    end if;
    if exists (select 1 from public.event_tickets t where t.id = any (ids) and t.status <> 'valid') then
      raise exception 'ticket_not_removable';
    end if;
    select coalesce(array_agg(t.holder_name order by t.seq), '{}') into names from public.event_tickets t where t.id = any (ids);
  else
    k := coalesce(_quantity, 0);
  end if;
  if k < 1 or k > r.quantity then raise exception 'invalid_removal_selection'; end if;

  select coalesce(sum(p.amount), 0) into paid_sum from public.event_payments p where p.registration_id = _reg and p.status = 'paid';
  cancel_all := k >= r.quantity;

  insert into public.event_ticket_removals (event_id, registration_id, tickets_removed, holder_names, reason, registration_cancelled, removed_by)
  values (r.event_id, _reg, k, names, v_reason, cancel_all, uid)
  returning id into removal;

  if has_tickets then
    update public.event_tickets set status = 'cancelled', removal_id = removal where id = any (ids);
  end if;

  if cancel_all then
    update public.event_registrations set status = 'cancelled', cancelled_at = now() where id = _reg;
    update public.event_tickets set status = 'cancelled' where registration_id = _reg and status <> 'cancelled';
    update public.event_payments set proof_path = null where registration_id = _reg and proof_path is not null;
    new_qty := 0; new_total := 0;
    refund := round(paid_sum, 2);
  else
    new_qty := r.quantity - k;
    new_total := round(r.unit_price * new_qty, 2);
    if exists (select 1 from public.event_payments where registration_id = _reg) then
      if paid_sum >= new_total then
        -- O que já foi pago cobre o novo total: parcelas ainda não avisadas saem. As "aguardando verificação" ficam
        -- (a pessoa pode ter pago de verdade) para a equipe conferir ou devolver.
        delete from public.event_payments where registration_id = _reg and status = 'pending';
      else
        select array_agg(p.id order by p.installment_no) into unpaid
          from public.event_payments p where p.registration_id = _reg and p.status <> 'paid';
        unpaid_n := coalesce(array_length(unpaid, 1), 0);
        if unpaid_n > 0 then
          due := new_total - paid_sum;
          base := round(due / unpaid_n, 2);
          for i in 1..unpaid_n loop
            update public.event_payments
               set amount = case when i = unpaid_n then due - base * (unpaid_n - 1) else base end
             where id = unpaid[i];
          end loop;
        end if;
      end if;
    end if;
    update public.event_registrations set quantity = new_qty, total = new_total where id = _reg;
    refund := round(greatest(paid_sum - new_total, 0), 2);
    -- Se sobraram só parcelas pagas, a inscrição que aguardava pagamento passa a estar quitada e o ingresso sai.
    perform public.refresh_event_registration(_reg);
  end if;

  update public.event_ticket_removals set refund_due = refund where id = removal;

  return jsonb_build_object('removed', k, 'registration_cancelled', cancel_all, 'new_quantity', new_qty,
                            'new_total', new_total, 'paid', round(paid_sum, 2), 'refund_due', refund);
end $function$;

revoke all on function public.remove_event_tickets(uuid, uuid[], integer, text) from public, anon;
grant execute on function public.remove_event_tickets(uuid, uuid[], integer, text) to authenticated, service_role;

-- Resumo do evento: o "pago" de cada inscrição não passa do total dela (o excedente de quem teve ingresso removido
-- aparece à parte, em refund_due_total), para o gráfico de pagamentos não ultrapassar 100%.
create or replace function public.event_admin_stats(_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.has_any_event_permission(auth.uid()) then raise exception 'Acesso negado'; end if;
  select jsonb_build_object(
    'registrations', (select count(*) from public.event_registrations where event_id = _event and status <> 'cancelled'),
    'tickets_total', (select count(*) from public.event_tickets where event_id = _event and status <> 'cancelled'),
    'checked_in', (select count(*) from public.event_tickets where event_id = _event and status = 'checked_in'),
    'expected_total', (select coalesce(sum(r.total), 0) from public.event_registrations r
                         where r.event_id = _event and r.status <> 'cancelled' and exists (select 1 from public.event_payments p where p.registration_id = r.id)),
    'paid_total', (select coalesce(sum(least(x.paid, x.total)), 0) from (
                     select r.total, coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as paid
                       from public.event_registrations r join public.event_payments p on p.registration_id = r.id
                      where r.event_id = _event and r.status <> 'cancelled' group by r.id, r.total) x),
    'refund_due_total', (select coalesce(sum(greatest(x.paid - x.total, 0)), 0) from (
                     select r.total, coalesce(sum(p.amount) filter (where p.status = 'paid'), 0) as paid
                       from public.event_registrations r join public.event_payments p on p.registration_id = r.id
                      where r.event_id = _event and r.status <> 'cancelled' group by r.id, r.total) x),
    'claimed_total', (select coalesce(sum(p.amount), 0) from public.event_payments p
                        join public.event_registrations r on r.id = p.registration_id
                        where r.event_id = _event and r.status <> 'cancelled' and p.status = 'claimed'),
    'lots', coalesce((select jsonb_agg(jsonb_build_object('name', l.name, 'capacity', l.capacity, 'sold', public.lot_taken(l.id)) order by l.position, l.created_at)
                        from public.event_lots l where l.event_id = _event), '[]'::jsonb)
  ) into res;
  return res;
end $$;
