-- CRM team-wide read cursor (not WA delivery ticks, not WA "No leídos" label).
-- One cursor per conversation for the whole office; attribution = who last advanced it.

alter table public.conversations
  add column if not exists team_read_at timestamptz not null default now(),
  add column if not exists team_read_by uuid references public.profiles (id) on delete set null,
  add column if not exists team_read_message_id uuid references public.messages (id) on delete set null;

comment on column public.conversations.team_read_at is
  'CRM team read cursor. Inbound messages with created_at > team_read_at are unread for the whole team. Default now() on add so existing history is not dumped as unread.';

comment on column public.conversations.team_read_by is
  'Profile that last advanced the CRM team read cursor. Set by trigger from auth.uid(); clients cannot spoof.';

comment on column public.conversations.team_read_message_id is
  'Last inbound message covered by the team read cursor (nullable if none).';

create index if not exists messages_conversation_inbound_created_idx
  on public.messages (conversation_id, created_at)
  where direction = 'in' and deleted_at is null;

create or replace function public.conversations_bind_team_read()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if new.team_read_at is not distinct from old.team_read_at
    and new.team_read_by is not distinct from old.team_read_by
    and new.team_read_message_id is not distinct from old.team_read_message_id then
    return new;
  end if;

  select p.id
    into v_me
  from public.profiles p
  where p.user_id = auth.uid()
    and p.is_active = true
  limit 1;

  if v_me is null then
    raise exception 'conversations team read requires an active profile'
      using errcode = '42501';
  end if;

  -- Rewind (mark unread): keep previous reader for remaining read inbounds.
  if old.team_read_at is not null
    and new.team_read_at < old.team_read_at then
    new.team_read_by := old.team_read_by;
  else
    new.team_read_by := v_me;
  end if;

  return new;
end;
$$;

drop trigger if exists conversations_bind_team_read on public.conversations;
create trigger conversations_bind_team_read
  before update on public.conversations
  for each row
  execute function public.conversations_bind_team_read();

revoke all on function public.conversations_bind_team_read() from public, anon, authenticated;

create or replace function public.crm_unread_count(c public.conversations)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'in'
    and m.deleted_at is null
    and m.created_at > c.team_read_at
$$;

revoke all on function public.crm_unread_count(public.conversations) from public, anon;
grant execute on function public.crm_unread_count(public.conversations) to authenticated, service_role;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_msg_id uuid;
  v_at timestamptz;
begin
  if not public.is_active_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select m.id, m.created_at
    into v_msg_id, v_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.direction = 'in'
    and m.deleted_at is null
  order by m.created_at desc
  limit 1;

  update public.conversations
  set
    team_read_at = coalesce(v_at, now()),
    team_read_message_id = v_msg_id
  where id = p_conversation_id;
end;
$$;

create or replace function public.mark_conversation_unread(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last_id uuid;
  v_last_at timestamptz;
  v_prev_id uuid;
  v_cursor timestamptz;
begin
  if not public.is_active_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select c.team_read_at
    into v_cursor
  from public.conversations c
  where c.id = p_conversation_id;

  if not found then
    return;
  end if;

  select m.id, m.created_at
    into v_last_id, v_last_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.direction = 'in'
    and m.deleted_at is null
  order by m.created_at desc
  limit 1;

  if v_last_id is null or v_last_at is null then
    return;
  end if;

  -- Already unread for the team: leave cursor as-is.
  if v_last_at > v_cursor then
    return;
  end if;

  select m.id
    into v_prev_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.direction = 'in'
    and m.deleted_at is null
    and m.created_at < v_last_at
  order by m.created_at desc
  limit 1;

  update public.conversations
  set
    team_read_at = v_last_at - interval '1 microsecond',
    team_read_message_id = v_prev_id
  where id = p_conversation_id;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke all on function public.mark_conversation_unread(uuid) from public, anon;
grant execute on function public.mark_conversation_unread(uuid) to authenticated;
