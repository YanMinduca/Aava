-- Parte 3: excluir usuário (CEO/Pastor Presidente), comprovantes apagados ao cancelar inscrição,
-- e números de voluntários/departamentos só para quem tem permissão de departamentos. Pode rodar mais de uma vez.

-- Excluir a conta de um usuário. O cadastro de membro continua (sem vínculo), a menos que se peça para apagar também.
-- Tudo o que é da pessoa (perfil, papéis, permissões, pedidos de oração, inscrições, pagamentos, ingressos, comprovantes) vai junto.
create or replace function public.delete_user_account(_user uuid, _delete_member boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if not public.is_church_leadership(uid) then raise exception 'Acesso negado'; end if;
  if _user = uid then raise exception 'cannot_delete_self'; end if;
  if not exists (select 1 from auth.users where id = _user) then raise exception 'user_not_found'; end if;
  if public.has_role(_user, 'ceo') then raise exception 'cannot_delete_ceo'; end if;
  if public.has_role(_user, 'pastor_presidente') and not public.has_role(uid, 'ceo') then raise exception 'only_ceo_deletes_president'; end if;
  if _delete_member then
    delete from public.members where user_id = _user;
  end if;
  delete from auth.users where id = _user;
end $$;
revoke all on function public.delete_user_account(uuid, boolean) from public, anon;
grant execute on function public.delete_user_account(uuid, boolean) to authenticated;

-- Cancelar inscrição apaga os comprovantes (o arquivo vai para a lixeira e é removido do armazenamento)
create or replace function public.cancel_event_registration(_reg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.event_registrations%rowtype; staff boolean;
begin
  if uid is null then raise exception 'login_required'; end if;
  select * into r from public.event_registrations where id = _reg;
  if not found then raise exception 'not_found'; end if;
  staff := public.has_permission(uid, 'verify_event_payments') or public.has_permission(uid, 'manage_events');
  if not staff then
    if r.user_id <> uid then raise exception 'Acesso negado'; end if;
    if r.status <> 'pending' or exists (select 1 from public.event_payments p where p.registration_id = _reg and p.status in ('claimed', 'paid')) then
      raise exception 'cannot_cancel';
    end if;
  end if;
  if r.status = 'cancelled' then return; end if;
  update public.event_registrations set status = 'cancelled', cancelled_at = now() where id = _reg;
  update public.event_tickets set status = 'cancelled' where registration_id = _reg;
  update public.event_payments set proof_path = null where registration_id = _reg and proof_path is not null;
end $$;

-- Dashboard: voluntários e departamentos só para quem tem a permissão de departamentos (não para membro comum)
create or replace function public.dashboard_volunteer_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('departments', count(distinct d.id), 'volunteers', count(distinct dm.member_id))
  from public.departments d
  left join public.department_members dm on dm.department_id = d.id
  where (public.has_permission(auth.uid(), 'view_departments') or public.has_permission(auth.uid(), 'manage_departments'))
    and public.can_view_department(auth.uid(), d.id);
$$;
