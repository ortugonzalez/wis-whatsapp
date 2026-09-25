# Canal Kapso (`kapso-8257`) — CRM

**ADR:** [008](adr/008-kapso-channel-provider.md). Atención humana 1:1 + historial completo del número `+5493469698257` (mismo que cobranzas Kapso + GAS). **Sin** VM Baileys.

## Secrets (nombres only)

| Variable | Dónde |
| --- | --- |
| `KAPSO_API_KEY` | Panel server / Vercel |
| `KAPSO_PHONE_NUMBER_ID` | Panel server; también snapshot en `whatsapp_connections.kapso_phone_number_id` |
| `KAPSO_WEBHOOK_SECRET` | Firma HMAC del webhook CRM (`kind=kapso`) — distinto del secreto de cobranzas si cada URL tiene el suyo |

Nunca en el browser bundle. Ver `.env.example` y `orchestra.json` → `secrets.kapso`.

## Sector

| Campo | Valor |
| --- | --- |
| `slug` | `kapso-8257` |
| `display_name` | `Cobranzas · Kapso` |
| `channel_provider` | `kapso` |

Baileys workers must not use `SECTOR_SLUG=kapso-8257` (guard in `workers/whatsapp-baileys/src/sector.ts`).

## Webhooks R1

- cobranzas: `sent` + `failed` → `campana_envios`
- this CRM: `POST /api/webhooks/kapso` — events `received` + `sent`/`delivered`/`read`/`failed` → Postgres sector `kapso-8257`
- Firma: HMAC-SHA256 raw body ↔ `X-Webhook-Signature` + `KAPSO_WEBHOOK_SECRET`
- Dedupe: `X-Idempotency-Key` → `kapso_webhook_events`; messages `(sector_id, wa_message_id)`
- Alta CRM (2026-09-21): webhook id `687e3ff8-bc40-4510-81e4-fa5c71fad6ca` → `https://your-domain.vercel.app/api/webhooks/kapso` (`kind=kapso`, phone `1092201023966916`). Proxy permite esa ruta sin sesión.

## Egreso humano (K3)

- Path: `sendOutboundMessage` → si `channel_provider=kapso` → `sendKapsoText` (HTTP) **sin** outbox Baileys.
- Gate 24h: último `messages.direction=in` del hilo &lt; 24h; si no → error claro (templates = cobranzas).
- `biz_opaque_callback_data`: `crm:{message_uuid}`.
- Retry Kapso: reenviar desde composer (no `retryOutboundMessage` Baileys).
- Media outbound Kapso: diferido.

## Settings (K4)

- Sector Kapso: Settings sin QR; admin «Actualizar estado Kapso» → Platform API phone number → `whatsapp_connections.status` / phone.
- Connect / disconnect / send-test Baileys → **409** si `channel_provider=kapso`.
- Banner inbox: copy Kapso (sin VM/QR).

## Mirror + atribución (K5)

- Columna `messages.outbound_origin`: `crm` | `cobranzas` | `system`.
- Heurística `biz_opaque_callback_data`: `crm:{uuid}` → CRM; UUID bare → Cobranzas; else → Sistema.
- UI autor: nombre agente | «Cobranzas» | «Sistema»; templates visibles en el mismo hilo.
- Race CRM: webhook con `crm:{id}` vincula wamid antes de que el panel lo persista.

## Backfill historial (K6)

- Admin en Settings Kapso: dry-run / import **1 página** (`GET /platform/v1/whatsapp/messages`, limit 20).
- Idempotente por `(sector_id, wa_message_id)`.
- **Media:** no se descarga a Storage; body = placeholder `[image|audio|…]` (best-effort skip).
- Requiere `KAPSO_API_KEY` + phone_number_id; inserts vía service role (outbound sin `sent_by`).
- Más páginas: cada «Importar 1 página» avanza el cursor `after` en la sesión del Settings.

## Ventana 24h (K7)

- Composer Kapso: si no hay inbound &lt; 24h → deshabilitado + aviso («plantillas = cobranzas»).
- Baileys: sin cambio (`kapsoWindowOpen = null`).
- Server sigue bloqueando en `sendOutboundMessage` Kapso.

## Unread bidireccional (K8)

Misma proyección CRM que Baileys (label «No leídos» + cursor `team_read_*`). Sin `whatsapp_chat_read_ops` / labels Business.

| Dirección | Fuente de verdad | Mecánica |
| --- | --- | --- |
| Inbound | Nuevo `whatsapp.message.received` | Ingest asigna label «No leídos» en CRM (Kapso inbox ya cuenta unread nativo). |
| A→B (CRM → Kapso) | Abrir / marcar leído en CRM | `mark_conversation_read` + quita label + `POST …/messages` `status:read` + último inbound wamid ([mark-read](https://docs.kapso.ai/docs/whatsapp/send-messages/mark-read)). |
| B→A (Kapso → CRM) | Inbound `kapso.status=read` tras markRead en inbox nativo | Al foco/`visibilitychange` del panel Kapso: reconcile ≤40 chats con label; si status=read → `mark_conversation_read_from_whatsapp` + quita label. |
| Anti-loop | CRM acaba de markRead | Suppress ~60s en memoria de proceso (`noteKapsoCrmMarkRead`) para no re-aplicar B→A. |
| Marcar no leído CRM | Solo CRM | Meta/Kapso no tienen mark-unread; label vuelve en CRM; inbox Kapso puede seguir leído hasta un inbound nuevo. |

Columna `conversations.kapso_conversation_id` (UUID Kapso) se guarda en ingest para correlación futura.
