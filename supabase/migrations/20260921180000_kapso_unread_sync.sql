-- K8: Kapso unread sync — CRM projection label + Kapso conversation id.
-- Reuses ADR 004 «No leídos» projection; no Baileys write-back for kapso.

alter table public.conversations
  add column if not exists kapso_conversation_id text;

comment on column public.conversations.kapso_conversation_id is
  'Kapso platform conversation UUID (sector kapso). Used for markRead / unread reconcile. ADR 008 K8.';

create unique index if not exists conversations_sector_kapso_conversation_uidx
  on public.conversations (sector_id, kapso_conversation_id)
  where kapso_conversation_id is not null;

-- CRM-only unread projection for kapso-8257 (no WA Business label write).
insert into public.labels (sector_id, wa_label_id, name, color)
select s.id, 'kapso:unread', 'No leídos', '0'
from public.sectors s
where s.slug = 'kapso-8257'
  and s.channel_provider = 'kapso'
  and not exists (
    select 1
    from public.labels l
    where l.sector_id = s.id
      and public.is_wa_unread_label_name(l.name)
  );
