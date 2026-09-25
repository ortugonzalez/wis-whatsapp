-- Drop exposed SECURITY DEFINER helper; bind trigger looks up profile inline.

create or replace function public.conversations_bind_team_read()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_me uuid;
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;

  if new.team_read_at is not distinct from old.team_read_at
    and new.team_read_by is not distinct from old.team_read_by
    and new.team_read_message_id is not distinct from old.team_read_message_id then
    return new;
  end if;

  select p.id
    into v_me
  from public.profiles p
  where p.user_id = auth.uid()
    and p.is_active = true
  limit 1;

  if v_me is null then
    raise exception 'conversations team read requires an active profile'
      using errcode = '42501';
  end if;

  if old.team_read_at is not null
    and new.team_read_at < old.team_read_at then
    new.team_read_by := old.team_read_by;
  else
    new.team_read_by := v_me;
  end if;

  return new;
end;
$$;

drop function if exists public.current_profile_id();
