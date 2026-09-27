-- WIS API: scoped credentials, durable idempotency, leases and event outbox.
alter table public.whatsapp_connections add column if not exists qr_expires_at timestamptz;
alter table public.whatsapp_connections add column if not exists expected_phone_e164 text;
alter table public.whatsapp_connections add column if not exists lease_owner text;
alter table public.whatsapp_connections add column if not exists lease_expires_at timestamptz;
alter table public.contacts add column consent_at timestamptz;
alter table public.contacts add column consent_source text;
alter table public.contacts add column consent_scope text;
alter table public.contacts add column opted_out_at timestamptz;
alter table public.contacts add column consent_recorded_by uuid references public.profiles(id);

create table public.wis_api_tokens (
 id uuid primary key default gen_random_uuid(), sector_id uuid not null references public.sectors(id),
 name text not null, token_hash text not null unique, scopes text[] not null default '{read}',
 created_at timestamptz not null default now(), expires_at timestamptz, revoked_at timestamptz
);
alter table public.whatsapp_outbox add column api_token_id uuid references public.wis_api_tokens(id);
alter table public.whatsapp_outbox add column if not exists idempotency_key text;
alter table public.whatsapp_outbox add column request_hash text;
alter table public.whatsapp_outbox add column purpose text not null default 'transactional' check (purpose in ('transactional','campaign'));
create unique index if not exists whatsapp_outbox_sector_idempotency_uidx on public.whatsapp_outbox(sector_id,idempotency_key) where idempotency_key is not null;
alter table public.whatsapp_outbox drop constraint whatsapp_outbox_status_check;
alter table public.whatsapp_outbox add constraint whatsapp_outbox_status_check check(status in ('pending','sending','sent','failed','outcome_unknown'));

create or replace function public.wis_acquire_worker_lease(p_connection_id uuid,p_owner text,p_ttl_seconds int)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 update whatsapp_connections set lease_owner=p_owner,lease_expires_at=now()+make_interval(secs=>least(greatest(p_ttl_seconds,10),120))
 where id=p_connection_id and (lease_owner=p_owner or lease_expires_at is null or lease_expires_at<now());
 return found;
end $$;
create or replace function public.wis_release_worker_lease(p_connection_id uuid,p_owner text)
returns void language sql security definer set search_path=public as $$
 update whatsapp_connections set lease_owner=null,lease_expires_at=null where id=p_connection_id and lease_owner=p_owner;
$$;
revoke all on function public.wis_acquire_worker_lease(uuid,text,int),public.wis_release_worker_lease(uuid,text) from public,anon,authenticated;
grant execute on function public.wis_acquire_worker_lease(uuid,text,int),public.wis_release_worker_lease(uuid,text) to service_role;

-- This applies to legacy UI, RPCs, and API queue insertions alike.
create function public.wis_guard_outbound() returns trigger language plpgsql set search_path=public as $$
declare c public.contacts;
begin
 if new.status not in ('pending','sending') then return new; end if;
 select * into c from contacts where sector_id=new.sector_id and phone_e164=new.to_e164;
 if c.opted_out_at is not null then raise exception 'contact_opted_out'; end if;
 if c.id is null or c.consent_at is null or nullif(trim(c.consent_source),'') is null or nullif(trim(c.consent_scope),'') is null then raise exception 'contact_consent_required'; end if;
 if new.purpose='campaign' then raise exception 'campaigns_disabled'; end if;
 return new;
end $$;
create trigger wis_guard_outbound before insert or update of status on public.whatsapp_outbox for each row execute function public.wis_guard_outbound();

create table public.wis_webhooks (
 id uuid primary key default gen_random_uuid(),sector_id uuid not null references public.sectors(id),
 url text not null,secret text not null,enabled boolean not null default false,created_at timestamptz not null default now()
);
create table public.wis_webhook_deliveries (
 id uuid primary key default gen_random_uuid(),webhook_id uuid not null references public.wis_webhooks(id) on delete cascade,
 event_id uuid not null,event_type text not null,payload jsonb not null,attempts int not null default 0,
 status text not null default 'pending' check(status in ('pending','sending','delivered','failed')),
 available_at timestamptz not null default now(),last_error text,created_at timestamptz not null default now(),unique(webhook_id,event_id)
);
create function public.wis_emit_event() returns trigger language plpgsql security definer set search_path=public as $$
declare event_uuid uuid:=gen_random_uuid(); event_kind text; event_payload jsonb;
begin
 if TG_TABLE_NAME='messages' then
  event_kind:=case when TG_OP='INSERT' then 'message.created' else 'message.updated' end;
  event_payload:=jsonb_build_object('id',new.id,'sector_id',new.sector_id,'conversation_id',new.conversation_id,'wa_message_id',new.wa_message_id,'direction',new.direction,'type',new.type,'body',new.body,'delivery_status',new.delivery_status);
 else
  event_kind:='operation.updated';
  event_payload:=jsonb_build_object('id',new.id,'sector_id',new.sector_id,'status',new.status,'wa_message_id',new.wa_message_id);
 end if;
 insert into wis_webhook_deliveries(webhook_id,event_id,event_type,payload)
 select id,event_uuid,event_kind,jsonb_build_object('id',event_uuid,'type',event_kind,'created_at',now(),'data',event_payload)
 from wis_webhooks where sector_id=new.sector_id and enabled;
 return new;
end $$;
create trigger wis_message_events after insert or update of delivery_status on public.messages for each row execute function public.wis_emit_event();
create trigger wis_operation_events after update of status on public.whatsapp_outbox for each row execute function public.wis_emit_event();
create function public.wis_claim_webhooks() returns setof public.wis_webhook_deliveries language sql security definer set search_path=public as $$
 update wis_webhook_deliveries set status='pending',available_at=now() where status='sending' and available_at<now()-interval '2 minutes';
 with picked as (select d.id from wis_webhook_deliveries d join wis_webhooks w on w.id=d.webhook_id where d.status='pending' and d.available_at<=now() and w.enabled and d.attempts<5 order by d.created_at for update of d skip locked limit 10)
 update wis_webhook_deliveries d set status='sending',attempts=attempts+1,available_at=now() from picked where d.id=picked.id returning d.*;
$$;
revoke all on function public.wis_claim_webhooks() from public,anon,authenticated;
grant execute on function public.wis_claim_webhooks() to service_role;
alter table public.wis_api_tokens enable row level security;
alter table public.wis_webhooks enable row level security;
alter table public.wis_webhook_deliveries enable row level security;
revoke all on public.wis_api_tokens,public.wis_webhooks,public.wis_webhook_deliveries from anon,authenticated;
grant all on public.wis_api_tokens,public.wis_webhooks,public.wis_webhook_deliveries to service_role;
