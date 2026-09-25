-- Merge duplicate direct conversations for the same contact (PN JID vs LID).

do $$
declare
  r record;
  keeper_id uuid;
  dup_id uuid;
  i int;
begin
  for r in
    select
      contact_id,
      array_agg(id order by last_message_at desc nulls last, created_at desc) as conv_ids
    from public.conversations
    where kind = 'direct'
      and contact_id is not null
    group by contact_id
    having count(*) > 1
  loop
    keeper_id := r.conv_ids[1];

    for i in 2..array_length(r.conv_ids, 1) loop
      dup_id := r.conv_ids[i];

      update public.messages
      set conversation_id = keeper_id
      where conversation_id = dup_id;

      update public.whatsapp_outbox
      set conversation_id = keeper_id
      where conversation_id = dup_id;

      insert into public.conversation_labels (conversation_id, label_id)
      select keeper_id, label_id
      from public.conversation_labels
      where conversation_id = dup_id
      on conflict do nothing;

      delete from public.conversations where id = dup_id;
    end loop;
  end loop;
end $$;
