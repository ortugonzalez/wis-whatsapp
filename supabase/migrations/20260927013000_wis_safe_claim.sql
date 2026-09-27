-- Revoked consent must fail only that operation, never starve the queue.
create or replace function public.wis_guard_outbound() returns trigger language plpgsql set search_path=public as $$
declare c public.contacts; failure text;
begin
 if new.status not in ('pending','sending') then return new; end if;
 select * into c from contacts where sector_id=new.sector_id and phone_e164=new.to_e164;
 if c.opted_out_at is not null then failure:='contact_opted_out';
 elsif c.id is null or c.consent_at is null or nullif(trim(c.consent_source),'') is null or nullif(trim(c.consent_scope),'') is null then failure:='contact_consent_required';
 elsif new.purpose='campaign' then failure:='campaigns_disabled'; end if;
 if failure is not null then
  if TG_OP='INSERT' then raise exception '%',failure; end if;
  new.status:='failed';new.last_error:=failure;
 end if;
 return new;
end $$;
create or replace function public.claim_whatsapp_outbox(p_limit int default 5,p_sector_id uuid default null)
returns setof public.whatsapp_outbox language plpgsql security definer set search_path=public as $$
begin
 if p_sector_id is null then raise exception 'sector_required'; end if;
 -- The guard turns revoked recipients into failed and they are excluded below.
 return query
 with picked as (
  select o.id from whatsapp_outbox o where o.status='pending' and o.sector_id=p_sector_id
  order by o.created_at for update skip locked limit least(greatest(coalesce(p_limit,1),1),20)
 ), updated as (
  update whatsapp_outbox o set status='sending',attempts=o.attempts+1,updated_at=now()
  from picked where o.id=picked.id returning o.*
 ) select * from updated where status='sending';
end $$;
revoke all on function public.claim_whatsapp_outbox(int,uuid) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_outbox(int,uuid) to service_role;
