-- K1 / ADR 008: multi-provider sectors + seed kapso-8257 (Cloud API via Kapso, no Baileys VM).

alter table public.sectors
  add column if not exists channel_provider text not null default 'baileys';

alter table public.sectors
  drop constraint if exists sectors_channel_provider_check;

alter table public.sectors
  add constraint sectors_channel_provider_check
  check (channel_provider in ('baileys', 'kapso'));

comment on column public.sectors.channel_provider is
  'baileys = VM worker + QR; kapso = Cloud API via Kapso (no Baileys VM). ADR 008.';

comment on table public.sectors is
  'Municipal WhatsApp sectors (one number each). channel_provider baileys|kapso. ADR 005 + ADR 008.';

alter table public.whatsapp_connections
  add column if not exists kapso_phone_number_id text;

comment on column public.whatsapp_connections.kapso_phone_number_id is
  'Meta phone_number_id when channel_provider=kapso; null for Baileys sectors.';

comment on table public.whatsapp_connections is
  'One connection row per sector. Baileys: session/QR. Kapso: WABA status + kapso_phone_number_id (ADR 008).';
