-- S4 BP1: whatsapp_connections (singleton) + whatsapp_outbox + claim RPC + RLS/grants.

create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'qr_pending', 'connected')),
  qr_payload text,
  phone text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_connections_singleton unique (singleton),
  constraint whatsapp_connections_singleton_true check (singleton = true)
);

comment on table public.whatsapp_connections is
  'Single-tenant Baileys session row. Soft reconnect must not flip connected→qr_pending while auth is valid.';

create trigger whatsapp_connections_set_updated_at
  before update on public.whatsapp_connections
  for each row
  execute function public.set_updated_at();

insert into public.whatsapp_connections (status)
values ('disconnected');

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  to_e164 text not null,
  conversation_id uuid references public.conversations (id) on delete set null,
  type text not null default 'text'
    check (type in ('text', 'image', 'audio', 'document')),
  body text,
  media_bucket_path text,
  sent_by uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  wa_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_outbox_e164_check check (to_e164 ~ ('^' || E'\\+' || '[1-9][0-9]{6,14}$'))
);

create index whatsapp_outbox_status_created_idx
  on public.whatsapp_outbox (status, created_at);

create index whatsapp_outbox_conversation_id_idx
  on public.whatsapp_outbox (conversation_id)
  where conversation_id is not null;

comment on table public.whatsapp_outbox is
  'Outbound queue drained by Baileys worker. Claim atomically; reclaim orphan sending rows.';

create trigger whatsapp_outbox_set_updated_at
  before update on public.whatsapp_outbox
  for each row
  execute function public.set_updated_at();

-- Atomic claim for worker (service_role). SKIP LOCKED avoids double-send.
create or replace function public.claim_whatsapp_outbox(p_limit int default 5)
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

  return query
  with picked as (
    select o.id
    from public.whatsapp_outbox o
    where o.status = 'pending'
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

revoke all on function public.claim_whatsapp_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox(int) to service_role;

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_outbox enable row level security;

-- Connections: active members read; only admin mutates status/connect.
create policy "Active members read whatsapp_connections"
  on public.whatsapp_connections
  for select
  to authenticated
  using (public.is_active_member());

create policy "Admins update whatsapp_connections"
  on public.whatsapp_connections
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Outbox: members read; active members enqueue; admin delete.
create policy "Active members read whatsapp_outbox"
  on public.whatsapp_outbox
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert whatsapp_outbox"
  on public.whatsapp_outbox
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and (
      sent_by is null
      or sent_by = (
        select p.id
        from public.profiles p
        where p.user_id = auth.uid()
          and p.is_active = true
      )
    )
  );

create policy "Admins delete whatsapp_outbox"
  on public.whatsapp_outbox
  for delete
  to authenticated
  using (public.is_admin());

revoke all on table public.whatsapp_connections from anon;
revoke all on table public.whatsapp_outbox from anon;

grant select, update on table public.whatsapp_connections to authenticated;
grant select, insert, delete on table public.whatsapp_outbox to authenticated;

grant all on table public.whatsapp_connections to service_role;
grant all on table public.whatsapp_outbox to service_role;
