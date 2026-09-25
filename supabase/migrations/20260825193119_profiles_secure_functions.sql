-- Harden SECURITY DEFINER helpers: fixed search_path; revoke anon EXECUTE.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.is_active_member() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.link_my_profile() from public, anon;

grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.link_my_profile() to authenticated;
