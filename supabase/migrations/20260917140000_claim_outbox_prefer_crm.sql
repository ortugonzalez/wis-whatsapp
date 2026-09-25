-- Claim: CRM / send-test primero; campañas cobranzas (client_ref.source) después.
-- Evita que un mensaje CRM espere detrás del pacing anti-ban de una campaña
-- en el mismo sector (Contable, Tesorería, u otro origen WA de campaña).

create or replace function public.claim_whatsapp_outbox(
  p_limit int default 5,
  p_sector_id uuid default null
)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 then
    p_limit := 1;
  end if;
  if p_limit > 20 then
    p_limit := 20;
  end if;
  if p_sector_id is null then
    raise exception 'claim_whatsapp_outbox requires p_sector_id';
  end if;

  return query
  with picked as (
    select o.id
    from public.whatsapp_outbox o
    where o.status = 'pending'
      and o.sector_id = p_sector_id
    order by
      case
        when coalesce(o.client_ref->>'source', '') in ('cobranzas', 'cobranzas_campaign')
          then 1
        else 0
      end,
      o.created_at
    for update skip locked
    limit p_limit
  )
  update public.whatsapp_outbox o
  set
    status = 'sending',
    attempts = o.attempts + 1,
    updated_at = now()
  from picked
  where o.id = picked.id
  returning o.*;
end;
$$;

comment on function public.claim_whatsapp_outbox(int, uuid) is
  'Claim pending outbox per sector; non-campaign (CRM) rows before cobranzas campaign rows.';

revoke all on function public.claim_whatsapp_outbox(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_outbox(int, uuid) to service_role;

comment on column public.whatsapp_connections.circuit_open_until is
  'Si now() < until, el worker no drena campañas cobranzas (429 / daily_cap). CRM/send-test no se bloquean.';
