-- Native WA inbox read/unread (chatModify / readMessages), separate from Business labels.

create table public.whatsapp_chat_read_ops (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  op text not null check (op in ('read', 'unread')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index whatsapp_chat_read_ops_status_created_idx
  on public.whatsapp_chat_read_ops (status, created_at);

create trigger whatsapp_chat_read_ops_set_updated_at
  before update on public.whatsapp_chat_read_ops
  for each row
  execute function public.set_updated_at();

alter table public.whatsapp_chat_read_ops enable row level security;

create policy "Active members read whatsapp_chat_read_ops"
  on public.whatsapp_chat_read_ops
  for select
  to authenticated
  using (public.is_active_member());

create policy "Active members insert whatsapp_chat_read_ops"
  on public.whatsapp_chat_read_ops
  for insert
  to authenticated
  with check (public.is_active_member());

create policy "Admins delete whatsapp_chat_read_ops"
  on public.whatsapp_chat_read_ops
  for delete
  to authenticated
  using (public.is_admin());

revoke all on table public.whatsapp_chat_read_ops from anon;
grant select, insert, delete on table public.whatsapp_chat_read_ops to authenticated;
grant all on table public.whatsapp_chat_read_ops to service_role;
