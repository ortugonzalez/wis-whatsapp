-- S3 BP1: contacts, conversations, messages + RLS (shared inbox v1, no groups).

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  wa_jid text,
  wa_lid text,
  phone_e164 text,
  push_name text not null default '',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_has_wa_identity check (
    wa_jid is not null
    or wa_lid is not null
    or phone_e164 is not null
  )
);

create unique index contacts_wa_jid_uidx
  on public.contacts (wa_jid)
  where wa_jid is not null;

create unique index contacts_wa_lid_uidx
  on public.contacts (wa_lid)
  where wa_lid is not null;

create unique index contacts_phone_e164_uidx
  on public.contacts (phone_e164)
  where phone_e164 is not null;

comment on table public.contacts is
  'WhatsApp contact identity (JID/LID/E.164). Worker resolves AR numbers via onWhatsApp.';

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row
  execute function public.set_updated_at();

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete restrict,
  wa_chat_id text not null,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_wa_chat_id_unique unique (wa_chat_id)
);

create index conversations_contact_id_idx on public.conversations (contact_id);
create index conversations_last_message_at_idx
  on public.conversations (last_message_at desc nulls last);

comment on table public.conversations is
  '1:1 chats only in v1. No group model.';

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  wa_message_id text,
  direction text not null check (direction in ('in', 'out')),
  type text not null check (type in ('text', 'image', 'audio', 'document')),
  body text,
  media_bucket_path text,
  sent_by uuid references public.profiles (id) on delete set null,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  source text not null default 'live'
    check (source in ('live', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_inbound_no_sent_by check (
    direction = 'out' or sent_by is null
  )
);

create unique index messages_wa_message_id_uidx
  on public.messages (wa_message_id)
  where wa_message_id is not null;

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

comment on table public.messages is
  'CRM messages. wa_message_id unique when present. Worker writes inbound + ticks; panel inserts outbound.';

create trigger messages_set_updated_at
  before update on public.messages
  for each row
  execute function public.set_updated_at();

alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "Active members read contacts"
  on public.contacts
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert contacts"
  on public.contacts
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Active members update contacts"
  on public.contacts
  for update
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy "Admins delete contacts"
  on public.contacts
  for delete
  to authenticated
  using (public.is_admin());

create policy "Active members read conversations"
  on public.conversations
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert conversations"
  on public.conversations
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Active members update conversations"
  on public.conversations
  for update
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy "Admins delete conversations"
  on public.conversations
  for delete
  to authenticated
  using (public.is_admin());

create policy "Active members read messages"
  on public.messages
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert outbound messages"
  on public.messages
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and direction = 'out'
    and sent_by is not null
  );

create policy "Admins delete messages"
  on public.messages
  for delete
  to authenticated
  using (public.is_admin());

-- No authenticated UPDATE on messages: delivery ticks / inbound edits = service_role (bypasses RLS).

revoke all on table public.contacts from anon;
revoke all on table public.conversations from anon;
revoke all on table public.messages from anon;

grant select, insert, update, delete on table public.contacts to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, delete on table public.messages to authenticated;

grant all on table public.contacts to service_role;
grant all on table public.conversations to service_role;
grant all on table public.messages to service_role;
