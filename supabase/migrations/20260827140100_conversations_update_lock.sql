-- S12 follow-up: lock conversation identity fields for authenticated updates;
-- only last_message_* (and title for groups via service_role) should move from the panel.

drop policy if exists "Active members update conversations" on public.conversations;

-- Panel may update preview timestamps only; kind/wa_chat_id/contact_id/title stay fixed.
create policy "Active members update conversation previews"
  on public.conversations
  for update
  to authenticated
  using (public.is_active_member())
  with check (
    public.is_active_member()
    and kind = (select c.kind from public.conversations c where c.id = conversations.id)
    and wa_chat_id = (select c.wa_chat_id from public.conversations c where c.id = conversations.id)
    and contact_id is not distinct from (
      select c.contact_id from public.conversations c where c.id = conversations.id
    )
    and title is not distinct from (
      select c.title from public.conversations c where c.id = conversations.id
    )
  );
