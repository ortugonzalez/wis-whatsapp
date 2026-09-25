# ADR 004 — Lectura CRM alineada con unread nativo (proyección label «No leídos»)

## Context

El filtro «No leídos» usa la etiqueta nativa de WhatsApp Business. Un cursor CRM independiente generaba «leído en el panel ≠ leído en el teléfono». Lo que el CRM aporta de más es la **atribución** de quién del equipo abrió el chat.

**Enmienda 2026-09-16:** en producción el CRM mostraba ~46 no leídos con el teléfono en 0. La etiqueta Business 14 y el badge nativo (teléfono / WhatsApp Web) no son el mismo objeto. El worker espejaba `unreadCount > 0` e inbound hacia el cache CRM, pero el `0` de backfill se descartaba siempre, `unreadCount === null` (sync inicial Baileys / `markChatAsReadAction`) se ignoraba, y `messages.update` READ de inbound (`fromMe: false`) se tiraba porque solo se usan ticks de salientes. No había reconcile al terminar el historial (`isLatest`). La label 14 en CRM podía resucitar vía `labels.association` porque el espejo nativo→0 no hacía `removeChatLabel`.

## Decision

- **Verdad operativa de leído/no leído** = unread nativo multi-device (el mismo 0/N que ven el celular vinculado y WhatsApp Web). Teléfono, WA Web y CRM deben converger.
- **Proyección CRM** = etiqueta WA «No leídos» (`conversation_labels`, label 14). Filtro, chip y badge **siguen** leyendo esa label. No hay cursor de unread paralelo.
- Abrir / marcar leído en el CRM **quita** esa label (cola `whatsapp_label_ops`) y encola `whatsapp_chat_read_ops` (`read` → `readMessages` + `chatModify({ markRead: true, lastMessages })`). Marcar no leído **agrega** la label y `chatModify({ markRead: false })`.
- `lastMessages` va newest-first y **termina en el último mensaje recibido** (`fromMe: false`); si el último es un saliente, el patch de Baileys devuelve 200 y no cambia el teléfono (issues #1313 / #1406). En 1:1 LID se manda `remoteJid` = `@lid` y `remoteJidAlt` = PN (Baileys 7).
- Worker **espeja** unread nativo hacia la proyección:
  - Inbound entrante → no leído.
  - `chats.update` con `unreadCount > 0` → no leído; `=== 0` → leído (live).
  - `chats.update` / mark-read con `unreadCount === null` **fuera** del sync inicial → leído (Baileys usa `null` en sync inicial porque el chat ya está leído por defecto; no skipear `null` live como “sin dato”).
  - `messages.update` con `status=READ` y `fromMe === false` → leído nativo de ese chat. **No** toca `messages.delivery_status` (ticks de salientes).
  - Sentinel `unreadCount = -1` **se ignora**.
  - `chats.upsert` / `messaging-history.set` **antes** de `isLatest`: solo espejan `> 0` (el `0` de backfill incompleto del linked device es mentiroso).
  - Tras `messaging-history.set` con `isLatest` (y al quedar el socket `open` después del flush): **reconcile** — `> 0` no leído, `0` leído. Ese `0` es de confianza y debe poder bajar un CRM stale (p. ej. 46 vs teléfono 0) sin abrir chat por chat.
- Lookup de conversación: `wa_chat_id`, y en 1:1 también `contacts.wa_lid` **y** `contacts.wa_jid`. Grupos por `wa_chat_id` `@g.us`. Skip `unknown_chat` se loguea.
- Si el nativo dice leído y `labels_write_enabled`: encolar `remove` de label 14 (write-back) para que `labels.association` no resucite la etiqueta. Si dice no leído: `add`. Cache CRM se actualiza igual si el write está apagado.
- Cursor en `conversations`: `team_read_at`, `team_read_by`, `team_read_message_id`, `team_read_via` (`crm` | `whatsapp` | null). Solo atribución; no es la verdad de unread.
- Badge circular en la lista: solo si el chat tiene la label WA; el número = entrantes posteriores al cursor (mín. 1 si la label está).
- Atribución en el hilo:
  - `team_read_via = crm` → «Leído por &lt;nombre&gt;»
  - `team_read_via = whatsapp` → «Leído desde el teléfono» (celular o WA Web; Baileys no distingue el cliente)
  - `null` → sin línea de atribución
- Worker: al add/remove de la label unread sincroniza el cursor (`mark_conversation_unread_from_whatsapp` / `mark_conversation_read_from_whatsapp`). El eco WA tras un mark-read del panel **no** pisa atribución `crm`.
- Backfill S16: chats que ya tenían la label WA quedan con cursor rebobinado (badge visible). El reconcile nativo post-`isLatest` puede **quitar** esa label si el teléfono/Web ya están en 0.
- **No** es `messages.delivery_status` (ticks del saliente).

## Consequences

- CRM, teléfono y WhatsApp Web convergen en leído/no leído vía unread nativo; la label 14 es proyección + filtro UI.
- Redeploy VM tras cambios en `workers/whatsapp-baileys/src/labels.ts` (y socket / inbound READ).
- Si `labels_write_enabled = false` o canal desconectado: el cache CRM igual se actualiza; la op WA puede no encolarse.
- Slices: S24 (espejo worker + reconcile + write-back), S25 (copy de atribución).
