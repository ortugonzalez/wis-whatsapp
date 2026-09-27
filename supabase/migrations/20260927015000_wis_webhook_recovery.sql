create or replace function public.wis_claim_webhooks() returns setof public.wis_webhook_deliveries language sql security definer set search_path=public as $$
 update wis_webhook_deliveries set status=case when attempts>=5 then 'failed' else 'pending' end,available_at=now(),last_error='claim_expired' where status='sending' and available_at<now()-interval '5 minutes';
 with picked as (select d.id from wis_webhook_deliveries d join wis_webhooks w on w.id=d.webhook_id where d.status='pending' and d.available_at<=now() and w.enabled and d.attempts<5 order by d.created_at for update of d skip locked limit 10)
 update wis_webhook_deliveries d set status='sending',attempts=attempts+1,available_at=now() from picked where d.id=picked.id returning d.*;
$$;
