-- Allowlist: acebalgestion@gmail.com (admin; org Gmail alongside soporte@acebal.gob.ar).
insert into public.profiles (email, slug, first_name, last_name, role, is_active)
values (
  'acebalgestion@gmail.com',
  'acebalgestion',
  'Gestión',
  'Acebal',
  'admin',
  true
)
on conflict (email) do update
set
  slug = excluded.slug,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  role = excluded.role,
  is_active = true,
  updated_at = now();
