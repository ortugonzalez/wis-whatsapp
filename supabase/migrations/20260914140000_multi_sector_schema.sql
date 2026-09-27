-- S19: sectors + sector_id on WA tables; backfill contable; drop connections singleton.
-- RLS membership tightening is S20; this slice keeps is_active_member policies.

create table public.sectors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sectors_slug_unique unique (slug),
  constraint sectors_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.sectors is
  'Municipal WhatsApp sectors (one Baileys number each). ADR 005.';

create trigger sectors_set_updated_at
  before update on public.sectors
  for each row
  execute function public.set_updated_at();

insert into public.sectors (slug, display_name) values
  ('contable', 'WIS · 5679');

create table public.sector_memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  sector_id uuid not null references public.sectors (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint sector_memberships_profile_sector_unique unique (profile_id, sector_id)
);

create index sector_memberships_sector_id_idx
  on public.sector_memberships (sector_id);

comment on table public.sector_memberships is
  'Which profiles may operate which sector bandeja. Admin global has both.';

-- --- connections: attach sector, drop singleton ---
alter table public.whatsapp_connections
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.whatsapp_connections c
set sector_id = s.id
from public.sectors s
where s.slug = 'contable';

alter table public.whatsapp_connections
  alter column sector_id set not null;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_singleton,
  drop constraint if exists whatsapp_connections_singleton_true;

alter table public.whatsapp_connections
  drop column singleton;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_sector_unique unique (sector_id);

insert into public.whatsapp_connections (sector_id, status)
select s.id, 'disconnected'
from public.sectors s
where s.slug = 'eq-tecnico-centros'
  and not exists (
    select 1 from public.whatsapp_connections c where c.sector_id = s.id
  );

comment on table public.whatsapp_connections is
  'One Baileys session row per sector. Soft reconnect must not flip connected→qr_pending while auth is valid.';

-- --- contacts ---
alter table public.contacts
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.contacts
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.contacts
  alter column sector_id set not null;

drop index if exists public.contacts_wa_jid_uidx;
drop index if exists public.contacts_wa_lid_uidx;
drop index if exists public.contacts_phone_e164_uidx;

create unique index contacts_sector_wa_jid_uidx
  on public.contacts (sector_id, wa_jid)
  where wa_jid is not null;

create unique index contacts_sector_wa_lid_uidx
  on public.contacts (sector_id, wa_lid)
  where wa_lid is not null;

create unique index contacts_sector_phone_e164_uidx
  on public.contacts (sector_id, phone_e164)
  where phone_e164 is not null;

create index contacts_sector_id_idx on public.contacts (sector_id);

-- --- conversations ---
alter table public.conversations
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.conversations
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.conversations
  alter column sector_id set not null;

alter table public.conversations
  drop constraint if exists conversations_wa_chat_id_unique;

alter table public.conversations
  add constraint conversations_sector_wa_chat_id_unique unique (sector_id, wa_chat_id);

create index conversations_sector_id_idx on public.conversations (sector_id);

-- --- messages ---
alter table public.messages
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.messages
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.messages
  alter column sector_id set not null;

drop index if exists public.messages_wa_message_id_uidx;

create unique index messages_sector_wa_message_id_uidx
  on public.messages (sector_id, wa_message_id)
  where wa_message_id is not null;

create index messages_sector_id_idx on public.messages (sector_id);

-- --- labels ---
alter table public.labels
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.labels
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.labels
  alter column sector_id set not null;

alter table public.labels
  drop constraint if exists labels_wa_label_id_unique;

alter table public.labels
  add constraint labels_sector_wa_label_id_unique unique (sector_id, wa_label_id);

create index labels_sector_id_idx on public.labels (sector_id);

-- --- outbox + ops ---
alter table public.whatsapp_outbox
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.whatsapp_outbox
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.whatsapp_outbox
  alter column sector_id set not null;

create index whatsapp_outbox_sector_status_created_idx
  on public.whatsapp_outbox (sector_id, status, created_at);

alter table public.whatsapp_label_ops
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.whatsapp_label_ops
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.whatsapp_label_ops
  alter column sector_id set not null;

create index whatsapp_label_ops_sector_id_idx
  on public.whatsapp_label_ops (sector_id);

alter table public.whatsapp_message_ops
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.whatsapp_message_ops
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.whatsapp_message_ops
  alter column sector_id set not null;

create index whatsapp_message_ops_sector_id_idx
  on public.whatsapp_message_ops (sector_id);

alter table public.whatsapp_chat_read_ops
  add column sector_id uuid references public.sectors (id) on delete restrict;

update public.whatsapp_chat_read_ops
set sector_id = (select id from public.sectors where slug = 'contable');

alter table public.whatsapp_chat_read_ops
  alter column sector_id set not null;

create index whatsapp_chat_read_ops_sector_id_idx
  on public.whatsapp_chat_read_ops (sector_id);

-- Memberships: everyone → contable; admin soporte → both
insert into public.sector_memberships (profile_id, sector_id)
select p.id, s.id
from public.profiles p
cross join public.sectors s
where s.slug = 'contable'
on conflict (profile_id, sector_id) do nothing;

insert into public.sector_memberships (profile_id, sector_id)
select p.id, s.id
from public.profiles p
cross join public.sectors s
where s.slug = 'eq-tecnico-centros'
  and lower(p.email) = lower('soporte@acebal.gob.ar')
on conflict (profile_id, sector_id) do nothing;

-- Claim outbox per sector (drop old 1-arg signature)
drop function if exists public.claim_whatsapp_outbox(int);

create or replace function public.claim_whatsapp_outbox(
  p_limit int default 5,
  p_sector_id uuid default null
)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 1;
  end if;
  if p_limit > 20 then
    p_limit := 20;
  end if;
  if p_sector_id is null then
    raise exception 'claim_whatsapp_outbox requires p_sector_id';
  end if;

  return query
  with picked as (
    select o.id
    from public.whatsapp_outbox o
    where o.status = 'pending'
      and o.sector_id = p_sector_id
    order by o.created_at
    for update skip locked
    limit p_limit
  )
  update public.whatsapp_outbox o
  set
    status = 'sending',
    attempts = o.attempts + 1,
    updated_at = now()
  from picked
  where o.id = picked.id
  returning o.*;
end;
$$;

revoke all on function public.claim_whatsapp_outbox(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox(int, uuid) to service_role;

-- Basic RLS for new tables (full membership scoping in S20)
alter table public.sectors enable row level security;
alter table public.sector_memberships enable row level security;

create policy "Active members read sectors"
  on public.sectors
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members read own sector_memberships"
  on public.sector_memberships
  for select
  to authenticated
  using (
    public.is_active_member()
    and (
      public.is_admin()
      or profile_id = (
        select p.id from public.profiles p
        where p.user_id = auth.uid() and p.is_active = true
      )
    )
  );

create policy "Admins manage sector_memberships"
  on public.sector_memberships
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on table public.sectors from anon;
revoke all on table public.sector_memberships from anon;
grant select on table public.sectors to authenticated;
grant select, insert, update, delete on table public.sector_memberships to authenticated;
grant all on table public.sectors to service_role;
grant all on table public.sector_memberships to service_role;
