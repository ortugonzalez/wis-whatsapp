-- Align CRM team-read with WA "No leídos" label.
-- Unread truth = label WA. CRM-only layer = attribution (who / from WhatsApp).

alter table public.conversations
  add column if not exists team_read_via text
  check (team_read_via is null or team_read_via in ('crm', 'whatsapp'));

comment on column public.conversations.team_read_via is
  'Attribution source for read inbounds: crm = Leído por <agent>; whatsapp = Leído desde WhatsApp; null = no attribution line yet.';

comment on column public.conversations.team_read_at is
  'Team read cursor aligned with WA unread label. Inbounds after this are CRM-unread when the WA unread label is present (or after mark-unread).';

comment on column public.conversations.team_read_by is
  'CRM profile that last marked the chat read in the panel. Null when last clear came from WhatsApp.';

create or replace function public.is_wa_unread_label_name(p_name text)
returns boolean
language sql
immutable
as $$
  select position(
    'NO LEID' in
    upper(
      translate(
        coalesce(p_name, ''),
        'áéíóúüñÁÉÍÓÚÜÑ',
        'aeiouunAEIOUUN'
      )
    )
  ) > 0
$$;

revoke all on function public.is_wa_unread_label_name(text) from public, anon;
grant execute on function public.is_wa_unread_label_name(text) to authenticated, service_role;

create or replace function public.wa_unread_label()
returns table (id uuid, wa_label_id text)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.wa_label_id
  from public.labels l
  where public.is_wa_unread_label_name(l.name)
  order by l.name
  limit 1
$$;

revoke all on function public.wa_unread_label() from public, anon;
grant execute on function public.wa_unread_label() to authenticated, service_role;

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
    and new.team_read_message_id is not distinct from old.team_read_message_id
    and new.team_read_via is not distinct from old.team_read_via then
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

  -- Rewind (mark unread): keep previous reader/via for remaining read inbounds.
  if old.team_read_at is not null
    and new.team_read_at < old.team_read_at then
    new.team_read_by := old.team_read_by;
    new.team_read_via := old.team_read_via;
  else
    new.team_read_by := v_me;
    new.team_read_via := 'crm';
  end if;

  return new;
end;
$$;

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
    -- team_read_by / via set by conversations_bind_team_read for authenticated
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

-- Worker (service_role): WA unread label removed → read from WhatsApp.
create or replace function public.mark_conversation_read_from_whatsapp(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_msg_id uuid;
  v_at timestamptz;
  v_cursor timestamptz;
  v_via text;
begin
  select c.team_read_at, c.team_read_via
    into v_cursor, v_via
  from public.conversations c
  where c.id = p_conversation_id;

  if not found then
    return;
  end if;

  select m.id, m.created_at
    into v_msg_id, v_at
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.direction = 'in'
    and m.deleted_at is null
  order by m.created_at desc
  limit 1;

  -- WA echo after CRM mark-read: keep «Leído por <agente>».
  if v_at is not null
    and v_cursor is not null
    and v_at <= v_cursor
    and v_via = 'crm' then
    return;
  end if;

  update public.conversations
  set
    team_read_at = coalesce(v_at, now()),
    team_read_message_id = v_msg_id,
    team_read_by = null,
    team_read_via = 'whatsapp'
  where id = p_conversation_id;
end;
$$;

-- Worker: WA unread label added → rewind cursor so badge can show a count.
create or replace function public.mark_conversation_unread_from_whatsapp(p_conversation_id uuid)
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
    team_read_message_id = v_prev_id,
    team_read_by = null,
    team_read_via = null
  where id = p_conversation_id;
end;
$$;

revoke all on function public.mark_conversation_read_from_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_read_from_whatsapp(uuid) to service_role;

revoke all on function public.mark_conversation_unread_from_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.mark_conversation_unread_from_whatsapp(uuid) to service_role;

-- Backfill: chats already tagged WA "No leídos" become CRM-unread (rewind cursor).
do $$
declare
  r record;
begin
  for r in
    select distinct cl.conversation_id
    from public.conversation_labels cl
    join public.labels l on l.id = cl.label_id
    where public.is_wa_unread_label_name(l.name)
  loop
    perform public.mark_conversation_unread_from_whatsapp(r.conversation_id);
  end loop;
end;
$$;
