-- S2: profiles allowlist + RLS. Pre-seed by email; link auth.users on first Google login via link_my_profile().

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null,
  slug text not null,
  first_name text not null default '',
  last_name text not null default '',
  role text not null check (role in ('admin', 'agent')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_unique unique (email),
  constraint profiles_slug_unique unique (slug)
);

create unique index profiles_email_lower_idx on public.profiles (lower(email));

comment on table public.profiles is
  'CRM team allowlist. Rows exist before Auth; user_id is set on first allowlisted Google login.';

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

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and is_active = true
      and role = 'admin'
  );
$$;

create or replace function public.link_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_profile public.profiles;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'NOT_ALLOWLISTED' using errcode = 'P0001';
  end if;

  select *
  into v_profile
  from public.profiles
  where lower(email) = v_email
    and is_active = true
  for update;

  if not found then
    raise exception 'NOT_ALLOWLISTED' using errcode = 'P0001';
  end if;

  if v_profile.user_id is not null and v_profile.user_id <> auth.uid() then
    raise exception 'PROFILE_ALREADY_LINKED' using errcode = 'P0001';
  end if;

  update public.profiles
  set user_id = auth.uid()
  where id = v_profile.id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.is_active_member() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.link_my_profile() from public, anon;

grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.link_my_profile() to authenticated;

alter table public.profiles enable row level security;

create policy "Active members read active team profiles"
  on public.profiles
  for select
  to authenticated
  using (
    is_active = true
    and public.is_active_member()
  );

create policy "Admins insert profiles"
  on public.profiles
  for insert
  to authenticated
  with check (public.is_admin());

create policy "Admins update profiles"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admins delete profiles"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on table public.profiles to authenticated;
grant all on table public.profiles to service_role;
revoke all on table public.profiles from anon;


-- WIS: administrator is provisioned locally by bootstrap-local.mjs.
