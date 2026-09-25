-- S7: label assign/remove queue for Baileys + write capability flag on connection.

alter table public.whatsapp_connections
  add column if not exists labels_write_enabled boolean not null default true;

comment on column public.whatsapp_connections.labels_write_enabled is
  'When false, panel is read-only for labels (WA write unstable). Worker may flip off after failures.';

create table public.whatsapp_label_ops (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  wa_label_id text not null,
  op text not null check (op in ('add', 'remove')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_label_ops_status_created_idx
  on public.whatsapp_label_ops (status, created_at);

create trigger whatsapp_label_ops_set_updated_at
  before update on public.whatsapp_label_ops
  for each row
  execute function public.set_updated_at();

alter table public.whatsapp_label_ops enable row level security;

create policy "Active members read whatsapp_label_ops"
  on public.whatsapp_label_ops
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert whatsapp_label_ops"
  on public.whatsapp_label_ops
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Admins delete whatsapp_label_ops"
  on public.whatsapp_label_ops
  for delete
  to authenticated
  using (public.is_admin());

revoke all on table public.whatsapp_label_ops from anon;
grant select, insert, delete on table public.whatsapp_label_ops to authenticated;
grant all on table public.whatsapp_label_ops to service_role;

-- Realtime for chips/filter without F5
do $$
begin
  alter publication supabase_realtime add table public.labels;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.conversation_labels;
exception
  when duplicate_object then null;
end $$;
