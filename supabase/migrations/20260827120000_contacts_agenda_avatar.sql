-- S9: contact agenda vs push name, verified business name, avatar path.

alter table public.contacts
  add column if not exists agenda_name text not null default '',
  add column if not exists verified_name text not null default '',
  add column if not exists avatar_path text;

comment on column public.contacts.agenda_name is
  'Name saved on the linked phone agenda (Baileys Contact.name). May be empty if MD protocol omits it.';
comment on column public.contacts.verified_name is
  'WhatsApp Business verified name when present (Baileys Contact.verifiedName).';
comment on column public.contacts.avatar_path is
  'Private Storage object path under whatsapp-media for profile photo; null = use initials in UI.';
comment on column public.contacts.push_name is
  'Contact profile push name (Baileys Contact.notify / message.pushName).';
comment on column public.contacts.display_name is
  'UI label: agenda_name → verified_name → push_name → phone_e164 (maintained by worker/app).';

-- Backfill display_name from existing push_name / phone (agenda empty until sync).
update public.contacts
set display_name = coalesce(
  nullif(trim(display_name), ''),
  nullif(trim(push_name), ''),
  nullif(trim(phone_e164), ''),
  'Sin nombre'
)
where coalesce(nullif(trim(display_name), ''), '') = '';
