-- Message, conversation and queue row are committed together for receipt correlation.
create function public.wis_enqueue_message(p_sector_id uuid,p_token_id uuid,p_profile_id uuid,p_key text,p_hash text,p_to text,p_type text,p_body text,p_media text)
returns public.whatsapp_outbox language plpgsql security definer set search_path=public as $$
declare previous public.whatsapp_outbox; contact public.contacts; conversation uuid; message uuid; queued public.whatsapp_outbox; jid text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_sector_id::text||':'||p_key,0));
 select * into previous from whatsapp_outbox where sector_id=p_sector_id and idempotency_key=p_key;
 if found then
  if previous.request_hash is distinct from p_hash then raise exception 'idempotency_conflict'; end if;
  return previous;
 end if;
 select * into contact from contacts where sector_id=p_sector_id and phone_e164=p_to;
 if contact.id is null then raise exception 'contact_consent_required'; end if;
 jid:=coalesce(contact.wa_jid,replace(p_to,'+','')||'@s.whatsapp.net');
 insert into conversations(sector_id,contact_id,wa_chat_id) values(p_sector_id,contact.id,jid)
 on conflict(sector_id,wa_chat_id) do update set contact_id=excluded.contact_id returning id into conversation;
 insert into messages(sector_id,conversation_id,direction,type,body,media_bucket_path,sent_by,delivery_status)
 values(p_sector_id,conversation,'out',p_type,p_body,p_media,p_profile_id,'pending') returning id into message;
 insert into whatsapp_outbox(sector_id,api_token_id,sent_by,idempotency_key,request_hash,to_e164,type,body,media_bucket_path,conversation_id,message_id)
 values(p_sector_id,p_token_id,p_profile_id,p_key,p_hash,p_to,p_type,p_body,p_media,conversation,message) returning * into queued;
 return queued;
end $$;
revoke all on function public.wis_enqueue_message(uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.wis_enqueue_message(uuid,uuid,uuid,text,text,text,text,text,text) to service_role;
