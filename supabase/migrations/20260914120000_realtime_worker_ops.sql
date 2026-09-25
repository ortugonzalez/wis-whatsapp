-- S18a: publish CRM→worker queue tables so the Baileys worker can wake via Realtime
-- instead of polling every 4s. Idempotent: skip if already in publication.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_outbox'
  ) then
    alter publication supabase_realtime add table public.whatsapp_outbox;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_label_ops'
  ) then
    alter publication supabase_realtime add table public.whatsapp_label_ops;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_chat_read_ops'
  ) then
    alter publication supabase_realtime add table public.whatsapp_chat_read_ops;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_message_ops'
  ) then
    alter publication supabase_realtime add table public.whatsapp_message_ops;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_connections'
  ) then
    alter publication supabase_realtime add table public.whatsapp_connections;
  end if;
end $$;
