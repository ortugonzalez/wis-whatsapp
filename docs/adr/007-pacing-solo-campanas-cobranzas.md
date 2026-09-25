# ADR 007 — Pacing anti-ban solo en campañas cobranzas

## Context

El worker Baileys aplicaba jitter (~50–90s), ventana horaria (default 9–13 ART), tope diario y circuit 429 a **todo** el outbox del sector. CRM, send-test y campañas compartían la misma cola: el panel quedaba lento y, fuera de ventana / con cap, podía no enviar. Las campañas de cobranzas eligen sector/worker por origen WA (`enqueue_sector_text` + `p_sector_slug`); Contable es un origen más, no el único.

## Decision

- Mensajes **CRM / send-test / humano** = envío **inmediato** (sin sleep anti-ban, sin ventana, sin tope diario, sin gate de circuit).
- Safety anti-ban = **solo** filas con `whatsapp_outbox.client_ref.source` ∈ `cobranzas` | `cobranzas_campaign` (cobranzas ya setea `source: "cobranzas"` en `enqueueSectorText`).
- El pacing sigue al **origen del mensaje** (campaña), no al nombre del sector: aplica en Contable, Tesorería u otro worker por igual.
- Claim prioriza no-campaña (`claim_whatsapp_outbox`); cooldown de campaña sin bloquear el tick del worker.

## Consequences

- **S20:** campañas leen `/app/config/wa-politica` vía pull cobranzas (`COBRANZAS_SITE_URL` + `WA_POLITICA_WORKER_SECRET`); `WA_PACING_*` = **fallback** si el pull falla. CRM no depende de esos env.
- Circuit `daily_cap` / `429` pausa campañas; CRM sigue drenando.
- Ops: detalle en [`docs/whatsapp-baileys.md`](../whatsapp-baileys.md) § Pacing anti-ban. Smoke humano Contable 2026-09-17: envíos CRM instantáneos post-redeploy.
