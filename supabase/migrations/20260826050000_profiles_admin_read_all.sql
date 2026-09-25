-- S8: admins must list inactive profiles to reactivate / manage allowlist.

create policy "Admins read all profiles"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

comment on policy "Admins read all profiles" on public.profiles is
  'OR with active-members SELECT so admins can see is_active=false rows.';
