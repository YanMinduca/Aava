-- Registro de atividades: quem fez o quê e quando nas áreas sensíveis (membros, financeiro,
-- permissões, eventos, site). Visível SOMENTE para o CEO.
--
-- Decisões de privacidade (para manter a regra "o que foi apagado some de verdade"):
--   * Nunca guarda valores de campos (CPF, RG, telefone, endereço...). Em edições guarda só o NOME dos campos alterados.
--   * Em membros guarda apenas o nome da pessoa no resumo. Entradas com mais de 12 meses são apagadas automaticamente.
--   * Ninguém escreve pelo front-end; só os gatilhos abaixo (security definer).

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  action text not null check (action in ('create', 'update', 'delete')),
  entity text not null,
  entity_id text,
  summary text not null,
  changed_fields text[]
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity, created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "ceo reads activity log" on public.activity_log;
create policy "ceo reads activity log" on public.activity_log
  for select to authenticated
  using (public.has_role(auth.uid(), 'ceo'));

revoke all on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- Gatilho genérico. O bloco de exceção garante que o registro NUNCA bloqueia a operação original.
create or replace function public.trg_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action text := case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end;
  v_entity text;
  v_summary text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_changed text[];
  v_target_name text;
  v_money text;
begin
  begin
    -- Apagar uma conta remove funções e permissões em cascata: isso já aparece como "Conta excluída",
    -- então não registra de novo. (pg_trigger_depth não distingue cascata aqui; o que distingue é a conta não existir mais.)
    if tg_op = 'DELETE' and tg_table_name in ('user_roles', 'user_permissions')
       and not exists (select 1 from auth.users u where u.id = (v_row ->> 'user_id')::uuid) then
      return null;
    end if;

    -- Em edições, descobre quais campos mudaram (só os nomes). Se nada relevante mudou, não registra.
    if tg_op = 'UPDATE' then
      select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(v_new) n
      where n.value is distinct from v_old -> n.key
        and n.key not in ('updated_at', 'notified_at');
      if v_changed is null then
        return null;
      end if;
    end if;

    if tg_table_name = 'members' then
      v_entity := 'members';
      v_summary := case tg_op
        when 'INSERT' then 'Membro cadastrado: ' || coalesce(v_row ->> 'full_name', '(sem nome)')
        when 'DELETE' then 'Membro excluído: ' || coalesce(v_row ->> 'full_name', '(sem nome)')
        else 'Membro editado: ' || coalesce(v_row ->> 'full_name', '(sem nome)') end;

    elsif tg_table_name = 'financial_transactions' then
      v_entity := 'financial';
      v_money := 'R$ ' || replace(to_char(coalesce((v_row ->> 'amount')::numeric, 0), 'FM999999990.00'), '.', ',');
      v_summary := case tg_op
        when 'INSERT' then 'Lançamento criado: '
        when 'DELETE' then 'Lançamento excluído: '
        else 'Lançamento editado: ' end
        || case when v_row ->> 'kind' = 'entrada' then 'receita ' else 'despesa ' end
        || v_money || ' (' || coalesce(v_row ->> 'category', 'sem categoria') || ')';

    elsif tg_table_name = 'financial_goals' then
      v_entity := 'financial';
      v_summary := case tg_op when 'INSERT' then 'Meta criada: ' when 'DELETE' then 'Meta excluída: ' else 'Meta editada: ' end
        || coalesce(v_row ->> 'title', '(sem título)');

    elsif tg_table_name = 'recurring_bills' then
      v_entity := 'financial';
      v_summary := case tg_op when 'INSERT' then 'Conta recorrente criada: ' when 'DELETE' then 'Conta recorrente excluída: ' else 'Conta recorrente editada: ' end
        || coalesce(v_row ->> 'name', '(sem nome)');

    elsif tg_table_name = 'event_payments' then
      -- Só confirmações/recusas de pagamento (dinheiro de evento). Criação e exclusão fazem parte da inscrição.
      if tg_op <> 'UPDATE' or v_new ->> 'status' is not distinct from v_old ->> 'status' then
        return null;
      end if;
      v_entity := 'events';
      v_summary := 'Pagamento de evento marcado como "' || coalesce(v_new ->> 'status', '?') || '" (R$ '
        || replace(to_char(coalesce((v_row ->> 'amount')::numeric, 0), 'FM999999990.00'), '.', ',') || ')';
      v_changed := array['status'];

    elsif tg_table_name = 'events' then
      v_entity := 'events';
      v_summary := case tg_op when 'INSERT' then 'Evento criado: ' when 'DELETE' then 'Evento excluído: ' else 'Evento editado: ' end
        || coalesce(v_row ->> 'title', '(sem título)');

    elsif tg_table_name = 'departments' then
      v_entity := 'departments';
      v_summary := case tg_op when 'INSERT' then 'Departamento criado: ' when 'DELETE' then 'Departamento excluído: ' else 'Departamento editado: ' end
        || coalesce(v_row ->> 'name', '(sem nome)');

    elsif tg_table_name = 'church_roles' then
      v_entity := 'access';
      v_summary := case tg_op when 'INSERT' then 'Cargo criado: ' when 'DELETE' then 'Cargo excluído: ' else 'Cargo editado: ' end
        || coalesce(v_row ->> 'name', '(sem nome)');

    elsif tg_table_name = 'site_content' then
      if tg_op = 'DELETE' then
        return null;
      end if;
      v_entity := 'site';
      v_summary := 'Conteúdo do site editado';
      v_changed := null;

    elsif tg_table_name in ('user_roles', 'user_permissions') then
      select coalesce(p.full_name, p.email) into v_target_name from public.profiles p where p.id = (v_row ->> 'user_id')::uuid;
      v_entity := 'access';
      if tg_table_name = 'user_roles' then
        v_summary := case tg_op when 'INSERT' then 'Função "' when 'DELETE' then 'Função removida "' else 'Função alterada "' end
          || coalesce(v_row ->> 'role', '?') || '" '
          || case tg_op when 'INSERT' then 'atribuída a ' when 'DELETE' then 'de ' else 'de ' end
          || coalesce(v_target_name, 'usuário removido');
      else
        v_summary := case tg_op when 'INSERT' then 'Permissão "' when 'DELETE' then 'Permissão removida "' else 'Permissão alterada "' end
          || coalesce(v_row ->> 'permission', '?') || '" '
          || case tg_op when 'INSERT' then 'concedida a ' else 'de ' end
          || coalesce(v_target_name, 'usuário removido');
      end if;
      v_changed := null;

    elsif tg_table_name = 'profiles' then
      -- Só exclusão de conta.
      if tg_op <> 'DELETE' then
        return null;
      end if;
      v_entity := 'access';
      v_summary := 'Conta excluída: ' || coalesce(v_row ->> 'full_name', v_row ->> 'email', '(sem nome)');

    else
      return null;
    end if;

    if v_actor is not null then
      select coalesce(p.full_name, p.email) into v_actor_name from public.profiles p where p.id = v_actor;
    end if;

    insert into public.activity_log (actor_id, actor_name, action, entity, entity_id, summary, changed_fields)
    values (v_actor, coalesce(v_actor_name, case when v_actor is null then 'Sistema' else 'Usuário removido' end),
            v_action, v_entity, v_row ->> 'id', v_summary, v_changed);

    -- Retenção de 12 meses: limpeza oportunista (cerca de 1 em cada 50 registros), sem depender de cron.
    if random() < 0.02 then
      delete from public.activity_log where created_at < now() - interval '12 months';
    end if;
  exception when others then
    raise warning 'activity_log (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

revoke execute on function public.trg_activity_log() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'financial_transactions', 'financial_goals', 'recurring_bills', 'event_payments',
    'events', 'departments', 'church_roles', 'site_content', 'user_roles', 'user_permissions', 'profiles'
  ] loop
    execute format('drop trigger if exists activity_log_%1$s on public.%1$I', t);
    execute format(
      'create trigger activity_log_%1$s after insert or update or delete on public.%1$I for each row execute function public.trg_activity_log()',
      t);
  end loop;
end $$;

-- Função que o painel chama. Só devolve dados para o CEO.
create or replace function public.activity_log_feed(
  _limit int default 50,
  _before timestamptz default null,
  _entity text default null,
  _search text default null
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_id uuid,
  actor_name text,
  action text,
  entity text,
  summary text,
  changed_fields text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'ceo') then
    raise exception 'Acesso negado';
  end if;
  return query
  select a.id, a.created_at, a.actor_id, a.actor_name, a.action, a.entity, a.summary, a.changed_fields
  from public.activity_log a
  where (_before is null or a.created_at < _before)
    and (_entity is null or a.entity = _entity)
    and (_search is null or btrim(_search) = ''
         or a.summary ilike '%' || btrim(_search) || '%'
         or a.actor_name ilike '%' || btrim(_search) || '%')
  order by a.created_at desc
  limit least(greatest(coalesce(_limit, 50), 1), 100);
end $$;

revoke all on function public.activity_log_feed(int, timestamptz, text, text) from public, anon;
grant execute on function public.activity_log_feed(int, timestamptz, text, text) to authenticated;
