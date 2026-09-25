-- S26: list/create sector labels (service_role) + enqueue_sector_text p_crm_label_id.
-- Assign to conversation happens in worker post-sent (S27), not in these RPCs.

-- --- outbox: optional campaign label to assign after sent ---
alter table public.whatsapp_outbox
  add column if not exists crm_label_id uuid references public.labels (id) on delete set null;

create index if not exists whatsapp_outbox_crm_label_id_idx
  on public.whatsapp_outbox (crm_label_id)
  where crm_label_id is not null;

comment on column public.whatsapp_outbox.crm_label_id is
  'Optional CRM/Business label (FK labels). Set by enqueue_sector_text; worker assigns after sent (S27).';

-- --- catalog create queue (worker drains in S27) ---
create table if not exists public.whatsapp_label_catalog_ops (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  wa_label_id text not null,
  name text not null,
  color int not null default 0
    check (color >= 0 and color <= 19),
  op text not null default 'create'
    check (op in ('create')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_label_catalog_ops_sector_status_idx
  on public.whatsapp_label_catalog_ops (sector_id, status, created_at);

create index if not exists whatsapp_label_catalog_ops_label_id_idx
  on public.whatsapp_label_catalog_ops (label_id);

comment on table public.whatsapp_label_catalog_ops is
  'Queue: create Business label catalog via Baileys addLabel (S26/S27). service_role only.';

create trigger whatsapp_label_catalog_ops_set_updated_at
  before update on public.whatsapp_label_catalog_ops
  for each row
  execute function public.set_updated_at();

alter table public.whatsapp_label_catalog_ops enable row level security;

revoke all on table public.whatsapp_label_catalog_ops from public, anon, authenticated;
grant all on table public.whatsapp_label_catalog_ops to service_role;

do $$
begin
  alter publication supabase_realtime add table public.whatsapp_label_catalog_ops;
exception
  when duplicate_object then null;
end $$;

-- Prefer unique name per sector for get-or-create (case-insensitive).
create unique index if not exists labels_sector_lower_name_uidx
  on public.labels (sector_id, lower(trim(name)));

-- --- list_sector_labels ---
create or replace function public.list_sector_labels(p_sector_slug text)
returns table (
  id uuid,
  name text,
  color text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sector_id uuid;
begin
  v_slug := nullif(trim(coalesce(p_sector_slug, '')), '');
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid sector_slug'
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

  return query
  select l.id, l.name, l.color, l.created_at
  from public.labels l
  where l.sector_id = v_sector_id
  order by l.name asc, l.created_at asc;
end;
$$;

comment on function public.list_sector_labels(text) is
  'List Business labels for a sector slug. Grants: service_role only (cobranzas).';

revoke all on function public.list_sector_labels(text)
  from public, anon, authenticated;
grant execute on function public.list_sector_labels(text)
  to service_role;

-- --- create_sector_label (optimistic get-or-create + catalog op) ---
create or replace function public.create_sector_label(
  p_sector_slug text,
  p_name text,
  p_color text default null
)
returns table (
  id uuid,
  name text,
  color text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_name text;
  v_sector_id uuid;
  v_color_text text;
  v_color_int int;
  v_label_id uuid;
  v_label_name text;
  v_label_color text;
  v_wa_label_id text;
  v_existing_id uuid;
begin
  v_slug := nullif(trim(coalesce(p_sector_slug, '')), '');
  v_name := nullif(trim(coalesce(p_name, '')), '');

  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid sector_slug'
      using errcode = '22023';
  end if;

  if v_name is null or char_length(v_name) > 100 then
    raise exception 'invalid label name'
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

  -- WA LabelColor 0–19; invalid/null → default 0. Stored as text on labels.color.
  v_color_text := nullif(trim(coalesce(p_color, '')), '');
  if v_color_text is not null and v_color_text ~ '^[0-9]+$' then
    v_color_int := v_color_text::int;
    if v_color_int < 0 or v_color_int > 19 then
      v_color_int := 0;
    end if;
  else
    v_color_int := 0;
  end if;
  v_color_text := v_color_int::text;

  select l.id into v_existing_id
  from public.labels l
  where l.sector_id = v_sector_id
    and lower(trim(l.name)) = lower(v_name)
  limit 1;

  if v_existing_id is not null then
    select l.id, l.name, l.color
      into v_label_id, v_label_name, v_label_color
    from public.labels l
    where l.id = v_existing_id;

    id := v_label_id;
    name := v_label_name;
    color := v_label_color;
    return next;
    return;
  end if;

  -- Provisional wa_label_id (numeric-ish) for Baileys addLabel; collision → retry.
  v_wa_label_id := '9' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');

  begin
    insert into public.labels (
      sector_id,
      wa_label_id,
      name,
      color,
      attrs
    )
    values (
      v_sector_id,
      v_wa_label_id,
      v_name,
      v_color_text,
      jsonb_build_object(
        'crm_create_pending', true,
        'source', 'cobranzas'
      )
    )
    returning labels.id, labels.name, labels.color
      into v_label_id, v_label_name, v_label_color;
  exception
    when unique_violation then
      -- Name race or wa_label_id race: prefer existing by name.
      select l.id, l.name, l.color
        into v_label_id, v_label_name, v_label_color
      from public.labels l
      where l.sector_id = v_sector_id
        and lower(trim(l.name)) = lower(v_name)
      limit 1;
      if v_label_id is null then
        raise;
      end if;
      id := v_label_id;
      name := v_label_name;
      color := v_label_color;
      return next;
      return;
  end;

  insert into public.whatsapp_label_catalog_ops (
    sector_id,
    label_id,
    wa_label_id,
    name,
    color,
    op,
    status
  )
  values (
    v_sector_id,
    v_label_id,
    v_wa_label_id,
    v_name,
    v_color_int,
    'create',
    'pending'
  );

  id := v_label_id;
  name := v_label_name;
  color := v_label_color;
  return next;
end;
$$;

comment on function public.create_sector_label(text, text, text) is
  'Get-or-create Business label by name (sector). Optimistic insert + catalog_ops create. Grants: service_role only.';

revoke all on function public.create_sector_label(text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_sector_label(text, text, text)
  to service_role;

-- --- enqueue_sector_text: add p_crm_label_id (drop old 5-arg overload) ---
drop function if exists public.enqueue_sector_text(text, text, text, jsonb, text);

create or replace function public.enqueue_sector_text(
  p_sector_slug text,
  p_to_e164 text,
  p_body text,
  p_client_ref jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_crm_label_id uuid default null
)
returns table (outbox_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_sector_id uuid;
  v_conn_status text;
  v_to_e164 text;
  v_body text;
  v_key text;
  v_client_ref jsonb;
  v_crm_label_id uuid;
  v_label_sector_id uuid;
  v_wa_chat_id text;
  v_contact_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_outbox_id uuid;
  v_preview text;
begin
  v_slug := nullif(trim(coalesce(p_sector_slug, '')), '');
  v_to_e164 := nullif(trim(coalesce(p_to_e164, '')), '');
  v_body := nullif(trim(coalesce(p_body, '')), '');
  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_client_ref := coalesce(p_client_ref, '{}'::jsonb);
  v_crm_label_id := p_crm_label_id;

  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid sector_slug'
      using errcode = '22023';
  end if;

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
  where s.slug = v_slug
  limit 1;

  if v_sector_id is null then
    raise exception 'sector % not found', v_slug
      using errcode = 'P0002';
  end if;

  if v_crm_label_id is not null then
    select l.sector_id into v_label_sector_id
    from public.labels l
    where l.id = v_crm_label_id
    limit 1;

    if v_label_sector_id is null then
      raise exception 'crm_label_id not found'
        using errcode = 'P0002';
    end if;

    if v_label_sector_id is distinct from v_sector_id then
      raise exception 'crm_label_id does not belong to sector %', v_slug
        using errcode = '22023';
    end if;
  end if;

  select c.status into v_conn_status
  from public.whatsapp_connections c
  where c.sector_id = v_sector_id
  limit 1;

  if v_conn_status is distinct from 'connected' then
    raise exception 'sector % WhatsApp not connected (status=%)', v_slug, coalesce(v_conn_status, 'missing')
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
        sector_id,
        phone_e164,
        wa_jid,
        push_name,
        agenda_name,
        verified_name,
        display_name
      )
      values (
        v_sector_id,
        v_to_e164,
        v_wa_chat_id,
        '',
        '',
        '',
        v_to_e164
      )
      returning contacts.id into v_contact_id;
    exception
      when unique_violation then
        select c.id into v_contact_id
        from public.contacts c
        where c.sector_id = v_sector_id
          and c.phone_e164 = v_to_e164
        limit 1;
        if v_contact_id is null then
          raise;
        end if;
    end;
  end if;

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
    begin
      insert into public.conversations (
        sector_id,
        contact_id,
        wa_chat_id,
        kind,
        last_message_at,
        last_message_preview
      )
      values (
        v_sector_id,
        v_contact_id,
        v_wa_chat_id,
        'direct',
        null,
        null
      )
      returning conversations.id into v_conversation_id;
    exception
      when unique_violation then
        select cv.id into v_conversation_id
        from public.conversations cv
        where cv.sector_id = v_sector_id
          and cv.wa_chat_id = v_wa_chat_id
        limit 1;
        if v_conversation_id is null then
          raise;
        end if;
    end;
  end if;

  v_preview := left(v_body, 120);

  insert into public.messages (
    sector_id,
    conversation_id,
    direction,
    type,
    body,
    media_bucket_path,
    sent_by,
    delivery_status,
    source
  )
  values (
    v_sector_id,
    v_conversation_id,
    'out',
    'text',
    v_body,
    null,
    null,
    'pending',
    'live'
  )
  returning messages.id into v_message_id;

  begin
    insert into public.whatsapp_outbox (
      sector_id,
      to_e164,
      to_jid,
      conversation_id,
      message_id,
      type,
      body,
      media_bucket_path,
      sent_by,
      status,
      idempotency_key,
      client_ref,
      crm_label_id
    )
    values (
      v_sector_id,
      v_to_e164,
      null,
      v_conversation_id,
      v_message_id,
      'text',
      v_body,
      null,
      null,
      'pending',
      v_key,
      v_client_ref,
      v_crm_label_id
    )
    returning whatsapp_outbox.id into v_outbox_id;
  exception
    when unique_violation then
      delete from public.messages m where m.id = v_message_id;
      select o.id, o.message_id
        into v_outbox_id, v_message_id
      from public.whatsapp_outbox o
      where o.sector_id = v_sector_id
        and o.idempotency_key = v_key
      limit 1;
      if v_outbox_id is null or v_message_id is null then
        raise;
      end if;
      outbox_id := v_outbox_id;
      message_id := v_message_id;
      return next;
      return;
  end;

  update public.conversations cv
  set
    last_message_at = now(),
    last_message_preview = v_preview
  where cv.id = v_conversation_id
    and cv.sector_id = v_sector_id;

  outbox_id := v_outbox_id;
  message_id := v_message_id;
  return next;
end;
$$;

comment on function public.enqueue_sector_text(text, text, text, jsonb, text, uuid) is
  'Service enqueue text for sector slug; optional p_crm_label_id (same sector, no assign). Grants: service_role only.';

revoke all on function public.enqueue_sector_text(text, text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_sector_text(text, text, text, jsonb, text, uuid)
  to service_role;

-- Compat wrapper Contable (+ optional crm label)
drop function if exists public.enqueue_contable_text(text, text, jsonb, text);

create or replace function public.enqueue_contable_text(
  p_to_e164 text,
  p_body text,
  p_client_ref jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_crm_label_id uuid default null
)
returns table (outbox_id uuid, message_id uuid)
language sql
security definer
set search_path = public
as $$
  select *
  from public.enqueue_sector_text(
    'contable',
    p_to_e164,
    p_body,
    p_client_ref,
    p_idempotency_key,
    p_crm_label_id
  );
$$;

comment on function public.enqueue_contable_text(text, text, jsonb, text, uuid) is
  'Wrapper: enqueue_sector_text(contable, …) + optional p_crm_label_id.';

revoke all on function public.enqueue_contable_text(text, text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_contable_text(text, text, jsonb, text, uuid)
  to service_role;
