-- Add sector Tesorería (Camino A): empty connection, admin membership only.
-- Mirror of eq-tecnico-centros seed in 20260914140000_multi_sector_schema.sql.
-- No Baileys pair / no E.164 in this pass.

insert into public.sectors (slug, display_name)
values ('tesoreria', 'Tesorería')
on conflict (slug) do nothing;

insert into public.whatsapp_connections (sector_id, status)
select s.id, 'disconnected'
from public.sectors s
where s.slug = 'tesoreria'
  and not exists (
    select 1 from public.whatsapp_connections c where c.sector_id = s.id
  );

-- Admin global only (same pattern as eq-tecnico-centros). Agents get membership via Settings.
insert into public.sector_memberships (profile_id, sector_id)
select p.id, s.id
from public.profiles p
cross join public.sectors s
where s.slug = 'tesoreria'
  and lower(p.email) = lower('soporte@acebal.gob.ar')
on conflict (profile_id, sector_id) do nothing;
