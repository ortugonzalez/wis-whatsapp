-- S6: link outbox rows to CRM messages so worker can set wa_message_id + delivery ticks.

alter table public.whatsapp_outbox
  add column if not exists message_id uuid references public.messages (id) on delete set null;

create index if not exists whatsapp_outbox_message_id_idx
  on public.whatsapp_outbox (message_id)
  where message_id is not null;

comment on column public.whatsapp_outbox.message_id is
  'CRM message row created by the panel composer; worker updates delivery_status / wa_message_id.';

-- Allow agents to roll back their own pending outbound if outbox insert fails.
create policy "Members delete own pending outbound messages"
  on public.messages
  for delete
  to authenticated
  using (
    direction = 'out'
    and delivery_status = 'pending'
    and sent_by is not null
    and sent_by = (
      select p.id
      from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
      limit 1
    )
  );
