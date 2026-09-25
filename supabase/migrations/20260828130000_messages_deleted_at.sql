-- Soft-delete for "eliminar para todos" (WhatsApp Web stub in UI).

alter table public.messages
  add column if not exists deleted_at timestamptz;

comment on column public.messages.deleted_at is
  'Set when message was revoked for everyone; panel shows deletion stub.';

create index if not exists messages_deleted_at_idx
  on public.messages (conversation_id, deleted_at)
  where deleted_at is not null;
