-- S3 BP2: labels cache + conversation_labels (WhatsApp Business is source of truth).

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  wa_label_id text not null,
  name text not null,
  color text,
  attrs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labels_wa_label_id_unique unique (wa_label_id)
);

comment on table public.labels is
  'Cache of WhatsApp Business labels. Panel mirrors assign/remove to WA when write is stable.';

create trigger labels_set_updated_at
  before update on public.labels
  for each row
  execute function public.set_updated_at();

create table public.conversation_labels (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, label_id)
);

create index conversation_labels_label_id_idx
  on public.conversation_labels (label_id);

comment on table public.conversation_labels is
  'N:N conversation ↔ label (shared inbox).';

alter table public.labels enable row level security;
alter table public.conversation_labels enable row level security;

create policy "Active members read labels"
  on public.labels
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert labels"
  on public.labels
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Active members update labels"
  on public.labels
  for update
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy "Admins delete labels"
  on public.labels
  for delete
  to authenticated
  using (public.is_admin());

create policy "Active members read conversation_labels"
  on public.conversation_labels
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert conversation_labels"
  on public.conversation_labels
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Active members delete conversation_labels"
  on public.conversation_labels
  for delete
  to authenticated
  using (public.is_active_member());

revoke all on table public.labels from anon;
revoke all on table public.conversation_labels from anon;

grant select, insert, update, delete on table public.labels to authenticated;
grant select, insert, delete on table public.conversation_labels to authenticated;

grant all on table public.labels to service_role;
grant all on table public.conversation_labels to service_role;
