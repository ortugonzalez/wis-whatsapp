-- Defense in depth: anon must not have table privileges on profiles (RLS already blocks).
revoke all on table public.profiles from anon;
