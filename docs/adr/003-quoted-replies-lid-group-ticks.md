# ADR 003 — Citas LID + ticks de grupo (post-S13)

## Context

Tras cerrar S13 en contrato, smoke en producción (2026-08-28) mostró:

1. **Citas salientes:** el destinatario veía solo texto plano. El panel y la outbox guardaban bien `quoted_wa_message_id`; el worker reconstruía `quoted.key.remoteJid` con el PN de envío (`onWhatsApp`) en chats MD `@lid`.
2. **Ticks en grupos:** mensajes salientes del CRM quedaban en `delivery_status=sent` (✓). Baileys 7 no emite esos avances en `messages.update` para `@g.us`; usa `message-receipt.update` por participante.

## Decision

- **Citas:** en `buildQuotedMessage`, `quoted.key.remoteJid` = JID del chat donde vive el stanza (`contacts.wa_lid` o `conversations.wa_chat_id`), no el PN de `sendMessage`. Log operativo: `outbox_quoted_build`.
- **Ticks grupo:** escuchar `message-receipt.update` además de `messages.update`. Avanzar a `delivered` / `read` con el **primer** ack de un participante (no esperar a todos — tradeoff vs WhatsApp nativo).

Commits: `f65fda3` (citas), `bcace02` (ticks grupo). Smokes humanos OK 2026-08-28.

## Consequences

- Redeploy VM obligatorio tras cambios en `workers/whatsapp-baileys/`.
- Ticks de grupo pueden mostrar ✓✓ antes que WA Web si solo un subconjunto de miembros recibió/leyó.
- Sin cambio de schema; solo worker + docs.
