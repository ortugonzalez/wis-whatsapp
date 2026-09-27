-- A QR is a session credential, not ordinary connection metadata.
drop policy if exists "Sector members read whatsapp_connections" on public.whatsapp_connections;
drop policy if exists "Active members read whatsapp_connections" on public.whatsapp_connections;
create policy "Admins read whatsapp_connections" on public.whatsapp_connections for select to authenticated
using (public.is_admin() and public.member_of_sector(sector_id));
create function public.wis_connection_metadata(p_sector_id uuid)
returns table(id uuid,sector_id uuid,status text,phone text,last_error text,updated_at timestamptz,qr_expires_at timestamptz,expected_phone_e164 text,labels_write_enabled boolean,kapso_phone_number_id text)
language sql stable security definer set search_path=public as $$
 select c.id,c.sector_id,c.status,c.phone,c.last_error,c.updated_at,c.qr_expires_at,c.expected_phone_e164,c.labels_write_enabled,c.kapso_phone_number_id
 from whatsapp_connections c where c.sector_id=p_sector_id and public.member_of_sector(c.sector_id);
$$;
revoke all on function public.wis_connection_metadata(uuid) from public,anon;
grant execute on function public.wis_connection_metadata(uuid) to authenticated,service_role;
