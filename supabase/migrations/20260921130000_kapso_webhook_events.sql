-- K2: idempotency keys for Kapso webhooks (at-least-once delivery).

create table if not exists public.kapso_webhook_events (
  idempotency_key text primary key,
  event text not null,
  processed_at timestamptz not null default now()
);

comment on table public.kapso_webhook_events is
  'Kapso X-Idempotency-Key store for CRM webhook (sector kapso-8257). ADR 008 / K2.';

alter table public.kapso_webhook_events enable row level security;

-- No policies for anon/authenticated: only service_role (bypasses RLS) writes from webhook route.
revoke all on table public.kapso_webhook_events from anon, authenticated;
grant select, insert on table public.kapso_webhook_events to service_role;
