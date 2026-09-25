-- S12: group conversations (attend-only) + sender attribution + outbox to_jid.

-- conversations: kind/title; contact_id nullable for groups
alter table public.conversations
  add column if not exists kind text not null default 'direct'
    constraint conversations_kind_check check (kind in ('direct', 'group')),
  add column if not exists title text;

alter table public.conversations
  alter column contact_id drop not null;

alter table public.conversations
  drop constraint if exists conversations_direct_needs_contact;

alter table public.conversations
  add constraint conversations_direct_needs_contact check (
    (kind = 'direct' and contact_id is not null)
    or (kind = 'group' and contact_id is null)
  );

comment on column public.conversations.kind is
  'direct = 1:1; group = WhatsApp group (@g.us). Groups are worker-ingested only.';
comment on column public.conversations.title is
  'Group subject / display title. Null for direct chats.';

create index if not exists conversations_kind_idx
  on public.conversations (kind);

-- messages: inbound group author
alter table public.messages
  add column if not exists wa_sender_jid text,
  add column if not exists wa_sender_name text;

comment on column public.messages.wa_sender_jid is
  'Participant JID for inbound group messages (key.participant).';
comment on column public.messages.wa_sender_name is
  'Best-effort pushName / label of the group sender for UI.';

-- outbox: allow group JID destinations (no E.164)
alter table public.whatsapp_outbox
  alter column to_e164 drop not null;

alter table public.whatsapp_outbox
  add column if not exists to_jid text;

alter table public.whatsapp_outbox
  drop constraint if exists whatsapp_outbox_e164_check;

alter table public.whatsapp_outbox
  drop constraint if exists whatsapp_outbox_dest_check;

alter table public.whatsapp_outbox
  add constraint whatsapp_outbox_dest_check check (
    (
      to_e164 is not null
      and to_e164 ~ ('^' || E'\\+' || '[1-9][0-9]{6,14}$')
      and to_jid is null
    )
    or (
      to_jid is not null
      and length(to_jid) between 5 and 128
      and to_e164 is null
    )
  );

comment on column public.whatsapp_outbox.to_jid is
  'Group (or non-E.164) destination JID. Mutually exclusive with to_e164.';

-- RLS: authenticated may insert only direct conversations (groups = service_role).
drop policy if exists "Active members insert conversations" on public.conversations;

create policy "Active members insert direct conversations"
  on public.conversations
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and kind = 'direct'
    and contact_id is not null
  );
