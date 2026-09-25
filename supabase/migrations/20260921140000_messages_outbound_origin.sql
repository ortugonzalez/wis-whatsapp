-- K5: attribution for Kapso mirrored outbound (CRM vs cobranzas vs GAS/system).

alter table public.messages
  add column if not exists outbound_origin text
    constraint messages_outbound_origin_check
      check (
        outbound_origin is null
        or outbound_origin in ('crm', 'cobranzas', 'system')
      );

comment on column public.messages.outbound_origin is
  'Kapso outbound attribution: crm (panel), cobranzas (campaign), system (GAS/other). Null for inbound or Baileys phone echoes.';
