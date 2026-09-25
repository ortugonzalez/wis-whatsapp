-- Harden messages insert: sent_by must be the caller's active profile (no spoof).
-- Align authenticated grants with intended privileges (no UPDATE/TRUNCATE).

drop policy if exists "Active members insert outbound messages" on public.messages;

create policy "Active members insert outbound messages"
  on public.messages
  for insert
  to authenticated
  with check (
    public.is_active_member()
    and direction = 'out'
    and sent_by = (
      select p.id
      from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active = true
    )
  );

revoke all on table public.messages from authenticated;
grant select, insert, delete on table public.messages to authenticated;
