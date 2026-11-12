-- Vincular (ou trocar/remover o vínculo de) um convite que já foi criado.
-- Vincular: a inscrição passa a ser da conta escolhida (user_id) e aparece em "Meus ingressos" dela.
-- Remover vínculo: volta para quem criou o convite (invited_by) e some de "Meus ingressos" da conta.
-- Só convites (is_invite) e só os que não estão cancelados. Mesma permissão de criar convites.
-- Idempotente.

create or replace function public.link_event_invite(_reg uuid, _user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  r public.event_registrations%rowtype;
  v_name text;
begin
  if uid is null then raise exception 'login_required'; end if;
  if not (public.has_permission(uid, 'manage_events')
          or public.has_permission(uid, 'verify_event_payments')
          or public.has_permission(uid, 'issue_event_invites')) then
    raise exception 'Acesso negado';
  end if;

  select * into r from public.event_registrations where id = _reg and is_invite for update;
  if not found then raise exception 'invite_not_found'; end if;
  if r.status = 'cancelled' then raise exception 'invite_cancelled'; end if;

  if _user is null then
    update public.event_registrations
       set user_id = coalesce(r.invited_by, r.user_id), account_linked = false
     where id = _reg;
    return jsonb_build_object('registration_id', _reg, 'linked_name', null);
  end if;

  select m.full_name into v_name from public.members m where m.user_id = _user limit 1;
  if v_name is null then raise exception 'account_not_found'; end if;

  update public.event_registrations set user_id = _user, account_linked = true where id = _reg;
  return jsonb_build_object('registration_id', _reg, 'linked_name', v_name);
end $function$;

revoke all on function public.link_event_invite(uuid, uuid) from public, anon;
grant execute on function public.link_event_invite(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
