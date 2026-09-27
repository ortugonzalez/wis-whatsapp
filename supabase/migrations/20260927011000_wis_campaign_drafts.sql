-- Draft-only campaigns. No automatic or immediate enqueue path exists.
create table public.wis_campaigns (
 id uuid primary key default gen_random_uuid(),sector_id uuid not null references public.sectors(id),
 name text not null,body text not null,contact_ids uuid[] not null default '{}',
 status text not null default 'draft' check(status in ('draft','approved','paused')),
 daily_limit integer not null check(daily_limit between 1 and 10000),
 window_start time not null,window_end time not null,timezone text not null default 'America/Argentina/Buenos_Aires',
 approved_at timestamptz,approved_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(window_start<window_end)
);
create trigger wis_campaigns_updated before update on public.wis_campaigns for each row execute function public.set_updated_at();
alter table public.wis_campaigns enable row level security;
revoke all on public.wis_campaigns from anon,authenticated;
grant all on public.wis_campaigns to service_role;
alter table public.contacts add column consent_api_token_id uuid references public.wis_api_tokens(id);
