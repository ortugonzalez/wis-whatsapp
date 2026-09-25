-- S8 Contable pacing: estado legible para circuit / tope diario (worker actualiza)

alter table public.whatsapp_connections
  add column if not exists circuit_open_until timestamptz,
  add column if not exists circuit_reason text,
  add column if not exists sends_today int not null default 0,
  add column if not exists sends_today_date date,
  add column if not exists last_send_at timestamptz;

comment on column public.whatsapp_connections.circuit_open_until is
  'Si now() < until, el worker no drena outbox (429 / cap / ops).';
comment on column public.whatsapp_connections.circuit_reason is
  'Motivo del circuit (ej. 429, daily_cap).';
comment on column public.whatsapp_connections.sends_today is
  'Envíos marcados sent hoy (reset por sends_today_date ART).';
comment on column public.whatsapp_connections.sends_today_date is
  'Fecha civil (America/Argentina/Buenos_Aires) del contador sends_today.';
comment on column public.whatsapp_connections.last_send_at is
  'Último send exitoso del worker.';
