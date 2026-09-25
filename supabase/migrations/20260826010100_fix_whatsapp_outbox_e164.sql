-- Fix E.164 check: previous apply escaped '+' incorrectly.
alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_e164_check;

alter table public.whatsapp_outbox
  add constraint whatsapp_outbox_e164_check
  check (to_e164 ~ ('^' || E'\\+' || '[1-9][0-9]{6,14}$'));
