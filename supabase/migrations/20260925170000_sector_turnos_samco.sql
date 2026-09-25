-- S34: sector Turnos · SAMCO (Baileys). Empty connection until QR on SAMCO VM.
insert into public.sectors (slug, display_name, channel_provider)
values ('turnos-samco', 'Turnos · SAMCO', 'baileys')
on conflict (slug) do update
  set display_name = excluded.display_name,
      channel_provider = excluded.channel_provider;

insert into public.whatsapp_connections (sector_id, status)
select s.id, 'disconnected'
from public.sectors s
where s.slug = 'turnos-samco'
  and not exists (
    select 1 from public.whatsapp_connections c where c.sector_id = s.id
  );

-- Admin global only. Agents via Settings.
insert into public.sector_memberships (profile_id, sector_id)
select p.id, s.id
from public.profiles p
cross join public.sectors s
where s.slug = 'turnos-samco'
  and lower(p.email) = lower('soporte@acebal.gob.ar')
on conflict (profile_id, sector_id) do nothing;
