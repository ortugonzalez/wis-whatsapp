# ADR 008 — Multi-provider: sector Kapso / Cloud API (`kapso-8257`)

**Status:** approved (2026-09-21) — confirmación usuario.  
**Amends:** `docs/architecture.md` (Summary / Out of scope «API Cloud Meta»; multi-provider).  
**Related:** cobranzas «Canal Kapso (Cloud API) paralelo» (approved 2026-09-18); cola Kapso cobranzas S23–S28 **done** (2026-09-21).

## Context

El CRM whatsapp-ui opera sectores Baileys (Contable, Equipo técnico, Tesorería) con VM + outbox. Existe un número WABA distinto (`5493469698257`) operado vía **Kapso / Meta Cloud API**, el mismo que:

- campañas Kapso en el repo **cobranzas**, y  
- el legado **GAS**.

Se necesita un sector CRM de **atención humana 1:1** sobre ese número, con **historial completo** (inbound vecino + salientes humanos del panel + salientes cobranzas/GAS), **sin** migrar Baileys, **sin** VM Kapso, **sin** implementar campañas/bot en este repo.

El contrato vigente decía «No se usa la API oficial de Meta» — esta ADR lo enmienda solo para el sector Kapso.

## Decision

1. **Camino A:** mismo Supabase + mismo panel Next.js; sector nuevo con `channel_provider = kapso`.
2. **Identidad del sector:** `slug = kapso-8257`, `display_name = Cobranzas · Kapso`. Número = `5493469698257` / mismo `KAPSO_PHONE_NUMBER_ID` que cobranzas y GAS.
3. **Sin worker Baileys / sin VM** para este sector. Ingress: webhook Kapso → Route Handler whatsapp-ui → Postgres → Realtime. Egress humano: HTTP Kapso desde server (panel) + **cola liviana** en Postgres (reusar patrón outbox scoped; drain en Vercel/server, no e2-micro).
4. **Webhooks R1 (verificado Kapso):** varios webhooks `kind=kapso` por `phone_number_id`, entrega independiente; solo **uno** `kind=meta`.
   - **cobranzas** (ya en su plan S25): eventos `whatsapp.message.sent` + `failed` → `campana_envios`.
   - **whatsapp-ui:** `received` + `sent` (+ `delivered`/`read`/`failed` según necesidad de ticks) → espejo del sector `kapso-8257`.
5. **Dedupe CRM:** unique `(sector_id, wa_message_id)` con `wa_message_id = wamid`. Idempotencia de evento: `X-Idempotency-Key`.
6. **Atribución en historial:**  
   - humano CRM → `sent_by_profile_id` (+ opcional `biz_opaque_callback_data` prefijo `crm:`);  
   - cobranzas → outbound sin match CRM / `biz_opaque_callback_data` = `campana_envio_id` (contrato cobranzas); UI «Cobranzas»;  
   - GAS / otros → outbound sin prefijo CRM; UI «Sistema» / «GAS» si se puede detectar.  
   Un solo hilo por conversación; no bifurcar ni ocultar campañas.
7. **Reglas Meta en CRM:** gate ventana 24h para free-form; fuera de ventana no texto libre (templates de campaña = cobranzas, no este panel). «Canal conectado» = status WABA/Kapso, no QR.
8. **No-goals (este repo / este sector):** migrar Baileys; bot/campañas cobranzas; VM Kapso; enqueue/labels de campaña; grupos MVP; paridad QR/labels Business Baileys.

### Webhook R1 — fuente

Kapso docs: *“Multiple webhooks per number, each delivered independently. Only one can be kind: meta”*  
([Migrate from 360dialog — Webhook configuration](https://docs.kapso.ai/docs/migrate/from-360dialog#webhook-configuration)).

Fallback **R2** (solo si el create del 2º webhook `kapso` falla en smoke): CRM único suscriptor + cobranzas reconcile-first para Kapso — **no** implementar R2 de antemano; requiere enmienda cobranzas **después** de su ola.

## Consequences (whatsapp-ui)

- Enmendar `docs/architecture.md` (hecho al aprobar ADR 008, 2026-09-21): multi-provider; excepción Cloud API solo en `kapso-8257`.
- Schema: `channel_provider` en `sectors` (o equivalente); connection Kapso (`phone_number_id`, status); sin fila VM orchestra para este sector.
- Settings WhatsApp: UI de estado CONNECTED/quality; sin QR para provider kapso.
- Slices tentativos K0–K7 (writing plan, cuando se apruebe arquitectura).
- Secrets panel: `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `KAPSO_WEBHOOK_SECRET` (CRM) — distintos secretos de firma que cobranzas si cada webhook tiene su `secret_key`.

## Cross-repo — cobranzas (paquete D1–D4)

**Estado (2026-09-21):** la ola Kapso en cobranzas (S23–S28) **terminó**. Este ADR **no edita** cobranzas; D1–D4 se aplican en una **sesión aparte** en ese repo (arquitecto/escritor), sin pisar el ship ya cerrado.

### Qué NO es esta nota

- No es un PR ni un diff automático en cobranzas desde whatsapp-ui.
- No pide cambiar el webhook de cobranzas ni el `biz_opaque_callback_data = campana_envio_id`.

### Qué SÍ aplicar en cobranzas (sesión dedicada)

| Ítem | Acción | Notas |
| --- | --- | --- |
| D1 — Convivencia webhooks R1 | Documentar: otro webhook `kind=kapso` lo registra whatsapp-ui para inbox; el de cobranzas sigue solo `sent`/`failed`. | R1 **complementa** S25; no lo reemplaza. |
| D2 — Label S27 Contable | Replantear: assign a sector **`kapso-8257`** (RPC/gate) **o** waive S27 para provider Kapso. | Hoy S27 apunta a Contable; el número no es Contable. |
| D3 — Clave origen vs slug CRM | Origen cobranzas = clave `kapso`; CRM = slug `kapso-8257`. No unificar nombres. | Solo documentar. |
| D4 — Fallback R2 | Solo si smoke del 2º webhook falla: enmienda ack Kapso a reconcile-first. | Contingencia. |

### Handshake (vigente)

- Cobranzas envía templates al mismo `phone_number_id` y ack por su webhook.
- whatsapp-ui espeja salientes/inbound por su propio webhook en `kapso-8257`.
- Cobranzas **no** escribe tablas WA del CRM.

## Explicit non-goals (ambos repos)

- No fan-out CRM → cobranzas ni cobranzas → CRM.
- No unificar Postgres.
- No migrar Contable Baileys a Kapso.
- No campañas en whatsapp-ui.

## Open questions (no bloquean approved)

- Cupo exacto de webhooks `kapso` por número (docs confirman «multiple»; no dan N) → smoke create #2.
- Copy exacto UI para autor GAS vs cobranzas.
- Idioma default templates (cobranzas ya lo tiene abierto).
