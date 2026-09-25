-- Hotfix: correct E.164 validation in enqueue_contable_text (avoid broken E-string escapes).
-- Idempotent CREATE OR REPLACE; safe if 20260915160000 already applied the fixed body.

create or replace function public.enqueue_contable_text(
  p_to_e164 text,
  p_body text,
  p_client_ref jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns table (outbox_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector_id uuid;
  v_conn_status text;
  v_to_e164 text;
  v_body text;
  v_key text;
  v_client_ref jsonb;
  v_wa_chat_id text;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_outbox_id uuid;
  v_preview text;
begin
  v_to_e164 := nullif(trim(coalesce(p_to_e164, '')), '');
  v_body := nullif(trim(coalesce(p_body, '')), '');
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_client_ref := coalesce(p_client_ref, '{}'::jsonb);

  if v_to_e164 is null
     or left(v_to_e164, 1) <> '+'
     or substring(v_to_e164 from 2) !~ '^[1-9][0-9]{6,14}$' then
    raise exception 'invalid to_e164 (expected E.164 +digits)'
      using errcode = '22023';
  end if;

  if v_body is null then
    raise exception 'empty body'
      using errcode = '22023';
  end if;

  select s.id into v_sector_id
  from public.sectors s
  where s.slug = 'contable'
  limit 1;

  if v_sector_id is null then
    raise exception 'sector contable not found'
      using errcode = 'P0002';
  end if;

  select c.status into v_conn_status
  from public.whatsapp_connections c
  where c.sector_id = v_sector_id
  limit 1;

  if v_conn_status is distinct from 'connected' then
    raise exception 'contable WhatsApp not connected (status=%)', coalesce(v_conn_status, 'missing')
      using errcode = 'P0001';
  end if;

  if v_key is not null then
    select o.id, o.message_id
      into v_outbox_id, v_message_id
    from public.whatsapp_outbox o
    where o.sector_id = v_sector_id
      and o.idempotency_key = v_key
    limit 1;

    if v_outbox_id is not null and v_message_id is not null then
      outbox_id := v_outbox_id;
      message_id := v_message_id;
      return next;
      return;
    end if;
  end if;

  v_wa_chat_id := substring(v_to_e164 from 2) || '@s.whatsapp.net';

  select c.id into v_contact_id
  from public.contacts c
  where c.sector_id = v_sector_id
    and c.phone_e164 = v_to_e164
  limit 1;

  if v_contact_id is null then
    begin
      insert into public.contacts (
        sector_id, phone_e164, wa_jid, push_name, agenda_name, verified_name, display_name
      )
      values (
        v_sector_id, v_to_e164, v_wa_chat_id, '', '', '', v_to_e164
      )
      returning id into v_contact_id;
    exception
      when unique_violation then
        select c.id into v_contact_id
        from public.contacts c
        where c.sector_id = v_sector_id and c.phone_e164 = v_to_e164
        limit 1;
        if v_contact_id is null then raise; end if;
    end;
  end if;

  select cv.id into v_conversation_id
  from public.conversations cv
  where cv.sector_id = v_sector_id and cv.wa_chat_id = v_wa_chat_id
  limit 1;

  if v_conversation_id is null then
    select cv.id into v_conversation_id
    from public.conversations cv
    where cv.sector_id = v_sector_id
      and cv.contact_id = v_contact_id
      and cv.kind = 'direct'
    order by cv.created_at
    limit 1;
  end if;

  if v_conversation_id is null then
    begin
      insert into public.conversations (
        sector_id, contact_id, wa_chat_id, kind, last_message_at, last_message_preview
      )
      values (
        v_sector_id, v_contact_id, v_wa_chat_id, 'direct', null, null
      )
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select cv.id into v_conversation_id
        from public.conversations cv
        where cv.sector_id = v_sector_id and cv.wa_chat_id = v_wa_chat_id
        limit 1;
        if v_conversation_id is null then raise; end if;
    end;
  end if;

  v_preview := left(v_body, 120);

  insert into public.messages (
    sector_id, conversation_id, direction, type, body, media_bucket_path,
    sent_by, delivery_status, source
  )
  values (
    v_sector_id, v_conversation_id, 'out', 'text', v_body, null,
    null, 'pending', 'live'
  )
  returning id into v_message_id;

  begin
    insert into public.whatsapp_outbox (
      sector_id, to_e164, to_jid, conversation_id, message_id, type, body,
      media_bucket_path, sent_by, status, idempotency_key, client_ref
    )
    values (
      v_sector_id, v_to_e164, null, v_conversation_id, v_message_id, 'text', v_body,
      null, null, 'pending', v_key, v_client_ref
    )
    returning id into v_outbox_id;
  exception
    when unique_violation then
      delete from public.messages m where m.id = v_message_id;
      select o.id, o.message_id into v_outbox_id, v_message_id
      from public.whatsapp_outbox o
      where o.sector_id = v_sector_id and o.idempotency_key = v_key
      limit 1;
      if v_outbox_id is null or v_message_id is null then raise; end if;
      outbox_id := v_outbox_id;
      message_id := v_message_id;
      return next;
      return;
  end;

  update public.conversations cv
  set last_message_at = now(), last_message_preview = v_preview
  where cv.id = v_conversation_id and cv.sector_id = v_sector_id;

  outbox_id := v_outbox_id;
  message_id := v_message_id;
  return next;
end;
$$;

revoke all on function public.enqueue_contable_text(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.enqueue_contable_text(text, text, jsonb, text)
  to service_role;
