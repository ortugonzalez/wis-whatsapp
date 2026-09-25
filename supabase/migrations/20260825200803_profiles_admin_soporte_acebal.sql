-- Admin allowlist: soporte@acebal.gob.ar (not the Supabase org Gmail).
update public.profiles
set
  email = 'soporte@acebal.gob.ar',
  slug = 'soporte',
  first_name = 'Soporte',
  last_name = 'Acebal',
  updated_at = now()
where lower(email) = 'acebalgestion@gmail.com'
  and role = 'admin';
