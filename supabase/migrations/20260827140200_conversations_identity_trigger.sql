-- S12: immutable conversation identity for authenticated (preview updates only).
-- Replaces fragile WITH CHECK self-subquery from conversations_update_lock.

drop policy if exists "Active members update conversation previews" on public.conversations;

create policy "Active members update conversations"
  on public.conversations
  for update
  to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create or replace function public.conversations_guard_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- service_role / worker may change kind/title/wa_chat_id; panel JWT may not.
  if auth.role() = 'authenticated' then
    if new.kind is distinct from old.kind
      or new.wa_chat_id is distinct from old.wa_chat_id
      or new.contact_id is distinct from old.contact_id
      or new.title is distinct from old.title then
      raise exception 'conversations identity fields are immutable for authenticated'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_guard_identity on public.conversations;
create trigger conversations_guard_identity
  before update on public.conversations
  for each row
  execute function public.conversations_guard_identity();

revoke all on function public.conversations_guard_identity() from public, anon, authenticated;
