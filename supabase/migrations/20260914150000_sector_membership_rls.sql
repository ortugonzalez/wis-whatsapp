-- S20: RLS by sector membership (member_of_sector).
-- service_role continues to bypass RLS.

create or replace function public.member_of_sector(p_sector_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sector_memberships sm
    join public.profiles p on p.id = sm.profile_id
    where sm.sector_id = p_sector_id
      and p.user_id = auth.uid()
      and p.is_active = true
  );
$$;

revoke all on function public.member_of_sector(uuid) from public, anon;
grant execute on function public.member_of_sector(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sectors: members see own; admins see all
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read sectors" on public.sectors;

create policy "Members read own sectors"
  on public.sectors
  for select
  to authenticated
  using (
    public.is_admin()
    or public.member_of_sector(id)
  );

-- sector_memberships: keep admin manage; members read own (already from S19)

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read contacts" on public.contacts;
drop policy if exists "Active members insert contacts" on public.contacts;
drop policy if exists "Active members update contacts" on public.contacts;

create policy "Sector members read contacts"
  on public.contacts
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert contacts"
  on public.contacts
  for insert
  to authenticated
  with check (public.member_of_sector(sector_id));

create policy "Sector members update contacts"
  on public.contacts
  for update
  to authenticated
  using (public.member_of_sector(sector_id))
  with check (public.member_of_sector(sector_id));

-- Admins delete contacts — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read conversations" on public.conversations;
drop policy if exists "Active members insert conversations" on public.conversations;
drop policy if exists "Active members insert direct conversations" on public.conversations;
drop policy if exists "Active members update conversations" on public.conversations;
drop policy if exists "Active members update conversation previews" on public.conversations;

create policy "Sector members read conversations"
  on public.conversations
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert direct conversations"
  on public.conversations
  for insert
  to authenticated
  with check (
    public.member_of_sector(sector_id)
    and kind = 'direct'
    and contact_id is not null
  );

create policy "Sector members update conversations"
  on public.conversations
  for update
  to authenticated
  using (public.member_of_sector(sector_id))
  with check (public.member_of_sector(sector_id));

-- Admins delete conversations — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read messages" on public.messages;
drop policy if exists "Active members insert outbound messages" on public.messages;
drop policy if exists "Members delete own pending outbound messages" on public.messages;

create policy "Sector members read messages"
  on public.messages
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert outbound messages"
  on public.messages
  for insert
  to authenticated
  with check (
    public.member_of_sector(sector_id)
    and direction = 'out'
    and sent_by = (
      select p.id
      from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
    )
  );

create policy "Members delete own pending outbound messages"
  on public.messages
  for delete
  to authenticated
  using (
    public.member_of_sector(sector_id)
    and direction = 'out'
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

-- Admins delete messages — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read labels" on public.labels;
drop policy if exists "Active members insert labels" on public.labels;
drop policy if exists "Active members update labels" on public.labels;

create policy "Sector members read labels"
  on public.labels
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert labels"
  on public.labels
  for insert
  to authenticated
  with check (public.member_of_sector(sector_id));

create policy "Sector members update labels"
  on public.labels
  for update
  to authenticated
  using (public.member_of_sector(sector_id))
  with check (public.member_of_sector(sector_id));

-- Admins delete labels — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- conversation_labels (no sector_id — via conversation)
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read conversation_labels" on public.conversation_labels;
drop policy if exists "Active members insert conversation_labels" on public.conversation_labels;
drop policy if exists "Active members delete conversation_labels" on public.conversation_labels;

create policy "Sector members read conversation_labels"
  on public.conversation_labels
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and public.member_of_sector(c.sector_id)
    )
  );

create policy "Sector members insert conversation_labels"
  on public.conversation_labels
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and public.member_of_sector(c.sector_id)
    )
  );

create policy "Sector members delete conversation_labels"
  on public.conversation_labels
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and public.member_of_sector(c.sector_id)
    )
  );

-- ---------------------------------------------------------------------------
-- whatsapp_connections
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read whatsapp_connections" on public.whatsapp_connections;
drop policy if exists "Admins update whatsapp_connections" on public.whatsapp_connections;

create policy "Sector members read whatsapp_connections"
  on public.whatsapp_connections
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Admins update whatsapp_connections"
  on public.whatsapp_connections
  for update
  to authenticated
  using (public.is_admin() and public.member_of_sector(sector_id))
  with check (public.is_admin() and public.member_of_sector(sector_id));

-- ---------------------------------------------------------------------------
-- whatsapp_outbox
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read whatsapp_outbox" on public.whatsapp_outbox;
drop policy if exists "Active members insert whatsapp_outbox" on public.whatsapp_outbox;

create policy "Sector members read whatsapp_outbox"
  on public.whatsapp_outbox
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert whatsapp_outbox"
  on public.whatsapp_outbox
  for insert
  to authenticated
  with check (
    public.member_of_sector(sector_id)
    and (
      sent_by is null
      or sent_by = (
        select p.id
        from public.profiles p
        where p.user_id = auth.uid()
          and p.is_active = true
      )
    )
  );

-- Admins delete whatsapp_outbox — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- whatsapp_label_ops
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read whatsapp_label_ops" on public.whatsapp_label_ops;
drop policy if exists "Active members insert whatsapp_label_ops" on public.whatsapp_label_ops;

create policy "Sector members read whatsapp_label_ops"
  on public.whatsapp_label_ops
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert whatsapp_label_ops"
  on public.whatsapp_label_ops
  for insert
  to authenticated
  with check (public.member_of_sector(sector_id));

-- Admins delete whatsapp_label_ops — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- whatsapp_message_ops
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read whatsapp_message_ops" on public.whatsapp_message_ops;
drop policy if exists "Active members insert whatsapp_message_ops" on public.whatsapp_message_ops;

create policy "Sector members read whatsapp_message_ops"
  on public.whatsapp_message_ops
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert whatsapp_message_ops"
  on public.whatsapp_message_ops
  for insert
  to authenticated
  with check (public.member_of_sector(sector_id));

-- Admins delete whatsapp_message_ops — unchanged (is_admin)

-- ---------------------------------------------------------------------------
-- whatsapp_chat_read_ops
-- ---------------------------------------------------------------------------
drop policy if exists "Active members read whatsapp_chat_read_ops" on public.whatsapp_chat_read_ops;
drop policy if exists "Active members insert whatsapp_chat_read_ops" on public.whatsapp_chat_read_ops;

create policy "Sector members read whatsapp_chat_read_ops"
  on public.whatsapp_chat_read_ops
  for select
  to authenticated
  using (public.member_of_sector(sector_id));

create policy "Sector members insert whatsapp_chat_read_ops"
  on public.whatsapp_chat_read_ops
  for insert
  to authenticated
  with check (public.member_of_sector(sector_id));

-- Admins delete whatsapp_chat_read_ops — unchanged (is_admin)
