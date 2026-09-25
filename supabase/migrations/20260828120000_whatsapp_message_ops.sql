-- Message forward / delete queue for Baileys (panel enqueues; worker executes).

create table public.whatsapp_message_ops (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  source_conversation_id uuid not null references public.conversations (id) on delete cascade,
  target_conversation_id uuid references public.conversations (id) on delete cascade,
  op text not null check (op in ('forward', 'delete_for_me', 'delete_for_everyone')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_message_ops_forward_target_chk check (
    (op = 'forward' and target_conversation_id is not null)
    or (op in ('delete_for_me', 'delete_for_everyone') and target_conversation_id is null)
  )
);

create index whatsapp_message_ops_status_created_idx
  on public.whatsapp_message_ops (status, created_at);

create trigger whatsapp_message_ops_set_updated_at
  before update on public.whatsapp_message_ops
  for each row
  execute function public.set_updated_at();

alter table public.whatsapp_message_ops enable row level security;

create policy "Active members read whatsapp_message_ops"
  on public.whatsapp_message_ops
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert whatsapp_message_ops"
  on public.whatsapp_message_ops
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Admins delete whatsapp_message_ops"
  on public.whatsapp_message_ops
  for delete
  to authenticated
  using (public.is_admin());

revoke all on table public.whatsapp_message_ops from anon;
grant select, insert, delete on table public.whatsapp_message_ops to authenticated;
grant all on table public.whatsapp_message_ops to service_role;
