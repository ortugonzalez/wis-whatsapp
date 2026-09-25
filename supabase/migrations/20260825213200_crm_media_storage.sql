-- S3 BP3: private hot media bucket + storage.objects policies (no anon).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Active members read whatsapp-media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_active_member()
  );

create policy "Active members upload whatsapp-media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and public.is_active_member()
  );

create policy "Active members update whatsapp-media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_active_member()
  )
  with check (
    bucket_id = 'whatsapp-media'
    and public.is_active_member()
  );

create policy "Admins delete whatsapp-media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and public.is_admin()
  );
