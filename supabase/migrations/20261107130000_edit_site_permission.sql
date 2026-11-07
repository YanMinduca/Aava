-- Permissão "edit_site": quem recebe essa permissão em "Usuários e permissões" pode editar a landing page.
--
-- user_permissions.permission é texto livre, então a permissão nova não precisa de mudança na tabela.
-- has_permission() já devolve verdadeiro para CEO e pastor presidente, que continuam editando como antes.
--
-- 1) site_content (texto, links, fotos, horários): escrita liberada para quem tem "edit_site".
-- 2) Bucket site-assets (fotos do site): envio, troca e remoção liberados para quem tem "edit_site".
-- 3) Pix e métodos de contribuição ficam só com CEO e pastor presidente: um gatilho mantém os valores atuais
--    de pixKeys e methods quando a alteração vem de quem não é liderança (vale também para chamadas diretas
--    à API, não só para a tela). Mudar quem pode mexer em dinheiro continua sendo decisão da liderança.

drop policy if exists "leadership site insert" on public.site_content;
drop policy if exists "site editors insert" on public.site_content;
create policy "site editors insert" on public.site_content for insert to authenticated
  with check (public.has_permission(auth.uid(), 'edit_site'));

drop policy if exists "leadership site update" on public.site_content;
drop policy if exists "site editors update" on public.site_content;
create policy "site editors update" on public.site_content for update to authenticated
  using (public.has_permission(auth.uid(), 'edit_site'))
  with check (public.has_permission(auth.uid(), 'edit_site'));

drop policy if exists "site assets insert" on storage.objects;
create policy "site assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.has_permission(auth.uid(), 'edit_site'));

drop policy if exists "site assets update" on storage.objects;
create policy "site assets update" on storage.objects for update to authenticated
  using (bucket_id = 'site-assets' and public.has_permission(auth.uid(), 'edit_site'))
  with check (bucket_id = 'site-assets' and public.has_permission(auth.uid(), 'edit_site'));

drop policy if exists "site assets delete" on storage.objects;
create policy "site assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.has_permission(auth.uid(), 'edit_site'));

drop policy if exists "site assets select" on storage.objects;
create policy "site assets select" on storage.objects for select to authenticated
  using (bucket_id = 'site-assets' and public.has_permission(auth.uid(), 'edit_site'));

create or replace function public.site_content_guard_finance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sem usuário (migrations, chave de serviço) e liderança: o conteúdo segue como veio.
  if auth.uid() is null or public.is_church_leadership(auth.uid()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.content := coalesce(new.content, '{}'::jsonb) - 'pixKeys' - 'methods';
  else
    new.content := (coalesce(new.content, '{}'::jsonb) - 'pixKeys' - 'methods')
      || jsonb_strip_nulls(jsonb_build_object('pixKeys', old.content -> 'pixKeys', 'methods', old.content -> 'methods'));
  end if;
  return new;
end $$;
revoke all on function public.site_content_guard_finance() from public, anon, authenticated;

drop trigger if exists site_content_guard_finance on public.site_content;
create trigger site_content_guard_finance before insert or update on public.site_content
  for each row execute function public.site_content_guard_finance();
