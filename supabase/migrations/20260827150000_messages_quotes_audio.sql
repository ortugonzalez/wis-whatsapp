-- S13: quoted replies + browser-recorded audio (webm) in private media bucket.

alter table public.messages
  add column if not exists quoted_message_id uuid
    references public.messages (id) on delete set null,
  add column if not exists quoted_wa_message_id text,
  add column if not exists quoted_body_preview text;

create index if not exists messages_quoted_message_id_idx
  on public.messages (quoted_message_id)
  where quoted_message_id is not null;

comment on column public.messages.quoted_message_id is
  'CRM message being replied to (nullable if only WA stanza id known).';
comment on column public.messages.quoted_wa_message_id is
  'WhatsApp stanza id of the quoted message (Baileys contextInfo.stanzaId).';
comment on column public.messages.quoted_body_preview is
  'Short preview of the quoted body for UI when the original row is out of window.';

alter table public.whatsapp_outbox
  add column if not exists quoted_wa_message_id text;

comment on column public.whatsapp_outbox.quoted_wa_message_id is
  'WA message id to pass as Baileys sendMessage options.quoted.key.id.';

-- Browser MediaRecorder often emits audio/webm (opus). Keep bucket private.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'whatsapp-media';
