-- Kapso cobranzas S27: assign Contable label by E.164 (service_role).
-- Fail-open semantics for callers: returns assigned=false when no contact/conversation.
-- Does NOT create contacts/conversations (unlike enqueue_sector_text).

create or replace function public.assign_sector_label_by_e164(
  p_sector_slug text,
  p_to_e164 text,
  p_crm_label_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sector_id uuid;
  v_to_e164 text;
  v_label_id uuid;
  v_wa_label_id text;
  v_label_sector_id uuid;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_wa_chat_id text;
  v_existing uuid;
begin
  v_slug := nullif(trim(coalesce(p_sector_slug, '')), '');
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid sector_slug'
      using errcode = '22023';
  end if;

  v_to_e164 := nullif(trim(coalesce(p_to_e164, '')), '');
  if v_to_e164 is null
     or left(v_to_e164, 1) <> '+'
     or substring(v_to_e164 from 2) !~ '^[1-9][0-9]{6,14}$' then
    raise exception 'invalid to_e164 (expected E.164 +digits)'
      using errcode = '22023';
  end if;

  if p_crm_label_id is null then
    raise exception 'crm_label_id required'
      using errcode = '22023';
  end if;

  select s.id into v_sector_id
  from public.sectors s
  where s.slug = v_slug
  limit 1;

  if v_sector_id is null then
    raise exception 'sector % not found', v_slug
      using errcode = 'P0002';
  end if;

  select l.id, l.wa_label_id, l.sector_id
    into v_label_id, v_wa_label_id, v_label_sector_id
  from public.labels l
  where l.id = p_crm_label_id
  limit 1;

  if v_label_id is null then
    raise exception 'crm_label_id not found'
      using errcode = 'P0002';
  end if;

  if v_label_sector_id is distinct from v_sector_id then
    raise exception 'crm_label_id does not belong to sector %', v_slug
      using errcode = '22023';
  end if;

  if v_wa_label_id is null or nullif(trim(v_wa_label_id), '') is null then
    return jsonb_build_object(
      'ok', true,
      'assigned', false,
      'reason', 'label_missing_wa_id',
      'label_id', v_label_id
    );
  end if;

  select c.id into v_contact_id
  from public.contacts c
  where c.sector_id = v_sector_id
    and c.phone_e164 = v_to_e164
  limit 1;

  if v_contact_id is null then
    return jsonb_build_object(
      'ok', true,
      'assigned', false,
      'reason', 'no_contact',
      'to_e164', v_to_e164
    );
  end if;

  v_wa_chat_id := substring(v_to_e164 from 2) || '@s.whatsapp.net';

  select cv.id into v_conversation_id
  from public.conversations cv
  where cv.sector_id = v_sector_id
    and cv.wa_chat_id = v_wa_chat_id
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
    return jsonb_build_object(
      'ok', true,
      'assigned', false,
      'reason', 'no_conversation',
      'contact_id', v_contact_id,
      'to_e164', v_to_e164
    );
  end if;

  insert into public.conversation_labels (conversation_id, label_id)
  values (v_conversation_id, v_label_id)
  on conflict (conversation_id, label_id) do nothing;

  select o.id into v_existing
  from public.whatsapp_label_ops o
  where o.sector_id = v_sector_id
    and o.conversation_id = v_conversation_id
    and o.wa_label_id = v_wa_label_id
    and o.op = 'add'
    and o.status in ('pending', 'sending', 'done')
  limit 1;

  if v_existing is null then
    insert into public.whatsapp_label_ops (
      sector_id,
      conversation_id,
      wa_label_id,
      op,
      status
    ) values (
      v_sector_id,
      v_conversation_id,
      v_wa_label_id,
      'add',
      'pending'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'assigned', true,
    'conversation_id', v_conversation_id,
    'contact_id', v_contact_id,
    'label_id', v_label_id,
    'to_e164', v_to_e164
  );
end;
$$;

comment on function public.assign_sector_label_by_e164(text, text, uuid) is
  'Assign CRM label to existing Contable (or sector) conversation by E.164. No invent contact/conversation. service_role only (cobranzas Kapso post-enviado).';

revoke all on function public.assign_sector_label_by_e164(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_sector_label_by_e164(text, text, uuid)
  to service_role;
