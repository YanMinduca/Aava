-- Viewing prayer requests is restricted to people with the explicit permission.
-- Existing create, update, and delete policies remain in place.
drop policy if exists "prayers own and leadership read" on public.prayer_requests;
create policy "authorized users view prayer requests" on public.prayer_requests
  for select to authenticated
  using (public.has_permission(auth.uid(), 'view_prayer_requests'));
