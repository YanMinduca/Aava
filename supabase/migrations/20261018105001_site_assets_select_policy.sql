drop policy if exists "site assets select" on storage.objects;
create policy "site assets select" on storage.objects for select to authenticated
  using (bucket_id = 'site-assets' and public.is_church_leadership(auth.uid()));
