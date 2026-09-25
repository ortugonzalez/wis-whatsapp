-- Batch unread counts for inbox list (avoids PostgREST computed-field + embed fragility).

create or replace function public.crm_inbox_unread_counts()
returns table (conversation_id uuid, unread_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id as conversation_id,
    count(m.id)::integer as unread_count
  from public.conversations c
  left join public.messages m
    on m.conversation_id = c.id
    and m.direction = 'in'
    and m.deleted_at is null
    and m.created_at > c.team_read_at
  group by c.id
$$;

revoke all on function public.crm_inbox_unread_counts() from public, anon;
grant execute on function public.crm_inbox_unread_counts() to authenticated;
