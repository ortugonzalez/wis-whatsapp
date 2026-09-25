-- S33: one round-trip for idle worker safety poll (log ingest / egress).
create or replace function public.worker_peek_pending(p_sector_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'outbox', exists(
      select 1 from public.whatsapp_outbox
      where sector_id = p_sector_id and status in ('pending', 'sending')
      limit 1
    ),
    'label_ops', exists(
      select 1 from public.whatsapp_label_ops
      where sector_id = p_sector_id and status in ('pending', 'sending')
      limit 1
    ),
    'catalog_ops', exists(
      select 1 from public.whatsapp_label_catalog_ops
      where sector_id = p_sector_id and status in ('pending', 'sending')
      limit 1
    ),
    'chat_read_ops', exists(
      select 1 from public.whatsapp_chat_read_ops
      where sector_id = p_sector_id and status in ('pending', 'sending')
      limit 1
    ),
    'message_ops', exists(
      select 1 from public.whatsapp_message_ops
      where sector_id = p_sector_id and status in ('pending', 'sending')
      limit 1
    )
  );
$$;

revoke all on function public.worker_peek_pending(uuid) from public;
revoke all on function public.worker_peek_pending(uuid) from anon, authenticated;
grant execute on function public.worker_peek_pending(uuid) to service_role;
