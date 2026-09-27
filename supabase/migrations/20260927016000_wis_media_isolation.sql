-- Replace permissive inherited Storage policies; a private bucket alone is not tenant isolation.
create function public.wis_media_sector(p_name text) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare parts text[]:=string_to_array(p_name,'/'); sector uuid;
begin
 if p_name is null or p_name like '%..%' or position(chr(92) in p_name)>0 or ''=any(parts) then return null; end if;
 if parts[1]='outbound' and array_length(parts,1)=4 then
  select id into sector from sectors where id::text=parts[2];
 elsif parts[1] in ('inbound','device') and array_length(parts,1)=3 then
  select sector_id into sector from conversations where id::text=parts[2];
 elsif parts[1]='avatars' and array_length(parts,1)=2 then
  select sector_id into sector from contacts where id::text||'.jpg'=parts[2];
 elsif array_length(parts,1)=2 then
  select id into sector from sectors where id::text=parts[1];
 end if;
 return sector;
end $$;
create function public.wis_can_read_media(p_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select coalesce(public.member_of_sector(public.wis_media_sector(p_name)),false);
$$;
create function public.wis_can_upload_media(p_name text) returns boolean
language sql stable security definer set search_path=public as $$
 select split_part(p_name,'/',1)='outbound'
 and public.wis_can_read_media(p_name)
 and exists(select 1 from profiles where user_id=auth.uid() and is_active and id::text=split_part(p_name,'/',3));
$$;
revoke all on function public.wis_media_sector(text),public.wis_can_read_media(text),public.wis_can_upload_media(text) from public,anon,authenticated;
grant execute on function public.wis_media_sector(text) to service_role;
grant execute on function public.wis_can_read_media(text),public.wis_can_upload_media(text) to authenticated,service_role;
drop policy if exists "Active members read whatsapp-media" on storage.objects;
drop policy if exists "Active members upload whatsapp-media" on storage.objects;
drop policy if exists "Active members update whatsapp-media" on storage.objects;
drop policy if exists "Admins delete whatsapp-media" on storage.objects;
create policy "WIS scoped media read" on storage.objects for select to authenticated
 using(bucket_id='whatsapp-media' and public.wis_can_read_media(name));
create policy "WIS own scoped media upload" on storage.objects for insert to authenticated
 with check(bucket_id='whatsapp-media' and public.wis_can_upload_media(name));
create policy "WIS own scoped media update" on storage.objects for update to authenticated
 using(bucket_id='whatsapp-media' and public.wis_can_upload_media(name))
 with check(bucket_id='whatsapp-media' and public.wis_can_upload_media(name));
create policy "WIS admin scoped media delete" on storage.objects for delete to authenticated
 using(bucket_id='whatsapp-media' and public.is_admin() and public.wis_can_read_media(name));

create function public.wis_guard_media_scope() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.media_bucket_path is not null and public.wis_media_sector(new.media_bucket_path) is distinct from new.sector_id then
  raise exception 'media_sector_mismatch';
 end if;
 return new;
end $$;
create trigger wis_outbox_media_scope before insert or update of media_bucket_path,sector_id on public.whatsapp_outbox
 for each row execute function public.wis_guard_media_scope();
