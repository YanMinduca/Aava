insert into storage.buckets (id, name, public) values ('event-assets', 'event-assets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('event-proofs', 'event-proofs', false) on conflict (id) do nothing;

drop policy if exists "event assets read" on storage.objects;
create policy "event assets read" on storage.objects for select to authenticated using (
  bucket_id = 'event-assets' and (
    public.has_permission(auth.uid(), 'manage_events')
    or exists (select 1 from public.event_registrations r where r.user_id = auth.uid() and r.status <> 'cancelled' and r.event_id::text = (storage.foldername(name))[1])));
drop policy if exists "event assets write" on storage.objects;
create policy "event assets write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.has_permission(auth.uid(), 'manage_events'));
drop policy if exists "event assets delete" on storage.objects;
create policy "event assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.has_permission(auth.uid(), 'manage_events'));

drop policy if exists "event proofs read" on storage.objects;
create policy "event proofs read" on storage.objects for select to authenticated using (
  bucket_id = 'event-proofs' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission(auth.uid(), 'verify_event_payments') or public.has_permission(auth.uid(), 'manage_events')));
drop policy if exists "event proofs write" on storage.objects;
create policy "event proofs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
