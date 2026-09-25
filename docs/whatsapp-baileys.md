# WhatsApp (Baileys) — whatsapp-ui

## Estado
Worker `whatsapp-ui-baileys` en la VM GCP (`services.whatsappVm` en orchestra) · sesión: connected (smoke humano S4/S5)
Librería: `baileys` `7.0.0-rc14` (must be ≥ 7; not 6.x)

## Smoke E.164 (obligatorio)

**Único número permitido** para cualquier smoke que encole / envíe WhatsApp (RPC `enqueue_*`, send-test, panel, worker, cobranzas→outbox):

`+5493469690201`

- No inventar E.164 de prueba (p. ej. `+5493415999999`).
- Validaciones fail-fast (cross-sector, body vacío, etc.) pueden hacerse **sin** enqueue a un destino real.
- Si hace falta enqueue real: solo a ese número; preferir `client_ref.source` de smoke y cleanup si el slice no debe dejar mensaje.

## Piezas
| Pieza | Ubicación |
| --- | --- |
| Tablas | `supabase/migrations/20260826010000_whatsapp_connections_outbox.sql` (+ fix E.164) |
| Outbox↔mensaje | `20260826030000_outbox_message_id.sql` (`message_id` + rollback DELETE pending propio) |
| Realtime | `supabase/migrations/20260826020000_realtime_messages_conversations.sql` + `20260914120000_realtime_worker_ops.sql` (outbox/ops/connections para wake del worker) |
| APIs admin | `app/api/whatsapp/{connect,disconnect,connection,send-test}/` |
| UI | Inbox `app/(inbox)/` + settings `app/settings/whatsapp/` |
| Worker | `workers/whatsapp-baileys/` (outbox texto/media + inbound 1:1/grupos + receipts → ticks) |

## Worker wake (S18a — egress)
- **Antes:** tick fijo cada 4 s → ~40k REST/día por cola aunque idle.
- **Ahora:** Realtime `postgres_changes` INSERT en `whatsapp_outbox`, `whatsapp_label_ops`, `whatsapp_label_catalog_ops`, `whatsapp_chat_read_ops`, `whatsapp_message_ops` + UPDATE en `whatsapp_connections` → `scheduleTick` (debounce 150 ms). Poll de seguridad default **120 s** (`WORKER_SAFETY_POLL_MS`; rango 60–120). Idle: RPC `worker_peek_pending` antes de drenar colas vacías (S33).
- **No** webhook HTTP a la VM (sigue sin puertos públicos).
- Requeues/claims vía UPDATE no despiertan Realtime a propósito (evita tormenta); el poll de seguridad los cubre.
- Logs: `worker_realtime_status`, `wake: realtime+safety_poll` en `worker_start`.
- Redeploy: `git pull` + `npm run build` + `pm2 restart whatsapp-ui-baileys` (ver runbook).

## Inbox lista (S18b — egress UI)
- Canal Realtime `s18b-inbox-list`: patch de **una** conversación (o solo labels) por evento; `UPDATE` de mensajes = meta (ticks) sin RPC unread global.
- Refresh full solo al volver el tab a `visible` (seguridad).
- Signed URLs de avatares: cache en sesión (`avatarUrlByIdRef`); no se re-firman en cada patch.

## Multi-sector (S19–S23)
- Tablas: `sectors`, `sector_memberships`; `sector_id` en connections/contacts/conversations/messages/labels/outbox/ops. Migración `20260914140000_multi_sector_schema.sql` (+ apply remoto en chunks).
- Seed: `contable` (datos existentes) + `eq-tecnico-centros` + `tesoreria` (vacíos). Sin columna `singleton`.
- Worker: env `SECTOR_SLUG` (requerido; sin default silencioso); `claim_whatsapp_outbox(p_limit, p_sector_id)` obligatorio; log `worker_start` incluye `sectorSlug`/`sectorId`.
- Auth Baileys: un `WHATSAPP_AUTH_DIR` por sector/VM. Orchestra: `whatsappVm` (Contable) + `whatsappVmEqTecnicoCentros` + `whatsappVmTesoreria` (placeholders hasta provisionar). Ver `docs/runbook-whatsapp-vm.md` § Multi-sector.
- **Tesorería follow-up:** VM/worker pueden estar up con sesión `disconnected`; QR cuando exista el número (no en la pasada de provision).
- RLS membership: S20. No vincular el 2º socket hasta usar el número.

## Enqueue externo multi-sector (`enqueue_sector_text`)
- Migración: `supabase/migrations/20260916150000_enqueue_sector_text.sql` + **S26** `20260917160000_sector_labels_enqueue_crm_label.sql`.
- Caller: producto **cobranzas** (server-only, `service_role` del proyecto whatsapp-ui). **No** expuesta a `anon`/`authenticated`.
- Sector: `p_sector_slug` (origen WA de la campaña: Contable, Tesorería, …). `enqueue_contable_text` es wrapper fijo a `contable`.
- Inputs: `p_sector_slug`, `p_to_e164`, `p_body`, `p_client_ref` (jsonb), `p_idempotency_key` (opcional), **`p_crm_label_id` uuid (opcional, S26)**.
- Si `p_crm_label_id` not null: debe existir y pertenecer al mismo sector; se persiste en `whatsapp_outbox.crm_label_id`. **No** asigna label en la RPC (assign post-`sent` → S27).
- Si null: comportamiento previo (CRM manual / send-test / enqueue viejo).
- Efecto: upsert contact/conversation direct → insert `messages` + `whatsapp_outbox` (`pending`); columnas `idempotency_key` / `client_ref` / `crm_label_id`.
- Outputs: `outbox_id`, `message_id`. Fail-fast si el sector no está `connected` o label cross-sector.
- Drain: worker del sector (`SECTOR_SLUG` + `claim_whatsapp_outbox`); cobranzas reconcilia leyendo status (no callback).

### Labels por sector (S26 RPCs cobranzas)
- `list_sector_labels(p_sector_slug)` → `{ id, name, color, created_at }[]` del sector. Solo `service_role`.
- `create_sector_label(p_sector_slug, p_name, p_color default null)` → get-or-create por nombre (trim + case-insensitive). Color = índice WA `0`–`19` (texto); inválido/null → `0`.
- Create nuevo: inserta `labels` (attrs `crm_create_pending`) + fila `whatsapp_label_catalog_ops` (`op=create`, `pending`). Worker crea en Business con `addLabel` en **S27**; fallback fail-fast si smoke create falla.
- Unique: `(sector_id, lower(trim(name)))` en `labels`.

### Worker labels campaña (S27)
- Tick: `drainLabelCatalogOps` (antes de `drainLabelOps`) → `sock.addLabel(meJid, { id, name, color })` para filas `whatsapp_label_catalog_ops` pending; Realtime wake incluye esa tabla.
- Tras `markOutboxSent`: si `crm_label_id` → upsert `conversation_labels` + encolar `whatsapp_label_ops` add (idempotente). Fallo = log `crm_label_assign_fail`; **no** revierte `sent`.
- Smoke outbound **solo** `+5493469690201`. Create catalog: si `addLabel` falla 2× → op `failed` + attrs `crm_create_failed` (fallback fail-fast en create RPC = follow-up humano).
- **Smoke Contable 2026-09-17 (S27):** `label_catalog_create_done` «Cobranzas»; enqueue `+5493469690201` con `crm_label_id` → `sent` + chip (`conversation_labels`) + `label_op_done` add; sin id → sent sin assign auto; cross-sector fail-fast OK. Worker redeploy `feat/s26-campaign-labels-rpc` @ `82a0f78`.

### UI Listas desde ⋮ (S28)
- Menú contextual de fila → **Agregar a lista** (toggles `toggleConversationLabel`) + **+ Nueva lista** (solo nombre → server action `createSectorLabel` → RPC `create_sector_label` con admin tras membership; sin `service_role` en client).
- Panel excluye la etiqueta sistema «No leídos»; write-disabled / vacío / error / Escape documentados en UI.
- **Smoke Contable 2026-09-17 (S28):** `+5493469690201` — create «S28 smoke» (`catalog_ops` done) + assign (chip + `label_ops` add done).

### Pacing anti-ban: solo campañas cobranzas
- **Producto:** Safety (jitter, ventana, tope diario, circuit 429) = **solo** filas de campaña. CRM/send-test: sin ventana/cap; **excepto** gap de cable cuando hay campaña draining (S21 / ADR 005 cobranzas).
- **Flag:** `whatsapp_outbox.client_ref.source` ∈ `cobranzas` | `cobranzas_campaign`. Cobranzas setea `source: "cobranzas"` + `wa_sector_slug`.
- **Fuente de verdad (S20):** worker **pull** `GET {COBRANZAS_SITE_URL}/api/internal/wa-politica?sector_slug=` con header `x-wa-politica-worker-secret` (= `WA_POLITICA_WORKER_SECRET`). Cache ~60s. Si falla → `WA_PACING_*` (env) + log `pacing_source=env_fallback`.
- **Worker (S21 reloj compartido):** sin draining → CRM inmediato. Con draining (outbox campaña `pending`/`sending` **o** cooldown de campaña): CRM espera ≥ `delay_min` desde el último `sendMessage` (release + wake `wire_cooldown`, sin sleep largo ni typing); tras CRM la campaña espera jitter completo; `lastWireSendAtMs` por proceso. Helpers: `wire-clock.ts`. Logs: `wire_pacing_hold`, `wire_pacing_after_crm`, `campaign_pacing_*`.
- **Inbox banner (S22):** copy fijo `Campaña en curso - Preferí responder desde otro canal` cuando hay outbox campaña pending/sending en el sector activo (poll 30s; fail-open UI). No bloquea composer.
- **Ops:** setear en cada VM `COBRANZAS_SITE_URL` + `WA_POLITICA_WORKER_SECRET` (mismo valor que Vercel cobranzas) y redeploy worker tras S21.
- **ADR cobranzas:** `docs/adr/004-worker-pull-wa-politica.md` + `docs/adr/005-reloj-compartido-origen-crm.md`. Local: [`adr/007-pacing-solo-campanas-cobranzas.md`](adr/007-pacing-solo-campanas-cobranzas.md).

## Enqueue externo Contable (`enqueue_contable_text`) — compat
- Wrapper de `enqueue_sector_text('contable', …)`. Migraciones históricas `20260915160000_*` / fix E.164.

## Inbound (S5/S12) + eco del teléfono
- Evento `messages.upsert`: **`notify`** (entrantes live) + **`append`** (salientes propios: forward, eco del teléfono). Sin backfill de historial por socket.
- 1:1 y grupos (`@g.us`); status/tipos no soportados se loguean y se ignoran.
- Upsert `contacts` + `conversations`, insert `messages` (`source=live`, dedupe por `wa_message_id`).
- Entrantes: `direction=in`. Salientes desde el celular / otro dispositivo vinculado: `fromMe` → `direction=out`, `sent_by=null` (UI: “Teléfono”). Eco del panel (mismo `wa_message_id`) se saltea por dedupe.
- Media (image/audio/document) → bucket privado `whatsapp-media` path `inbound|device/{conversationId}/{waMessageId}.{ext}` (no bytes en Postgres).
- UI: preview + descarga vía signed URL client-side (`lib/storage/use-signed-media-url.ts`; componentes `MessageImage`, `MessageDocument`, `MessageAudio`). **Audio en el panel:** reproductor propio (no `<audio controls>` nativo) porque el WebM del mic no trae duración en el contenedor → seek-trick + `decodeAudioData` para mostrar tiempos; WhatsApp recibe ogg/opus transcodificado en el worker.

## Media en el panel (S5/S14)
- Bucket **privado** `whatsapp-media`; RLS `authenticated` + `is_active_member()` (SELECT/INSERT/UPDATE).
- Panel firma URLs con JWT del usuario (`createSignedUrl`, TTL 1h); nunca CDN pública.
- **Inbound:** worker sube antes del insert; campo `messages.media_bucket_path`. Documentos sin caption guardan `fileName` en `body`.
- **Outbound CRM:** upload → `outbound/{profileId}/{uuid}.{ext}` → outbox; mismo bucket/path en `media_bucket_path`.
- **Smoke:** adjunto entrante con preview/descarga; adjunto saliente (PDF/imagen) descargable; confirmar objeto en Storage vía dashboard Supabase.

### Prep v3 — procesador automático de facturas (no implementado)
Job futuro sobre mensajes ya persistidos en Storage:
| Campo / dato | Uso |
| --- | --- |
| **Trigger sugerido** | `INSERT` en `messages` donde `type = 'document'` AND `media_bucket_path IS NOT NULL` (o cron sobre pendientes) |
| **Path estable** | `inbound/{conversationId}/{waMessageId}.{ext}` (entrante) · `outbound/{profileId}/{uuid}.{ext}` (CRM) |
| **Bucket** | `whatsapp-media` (privado; job con `service_role` + download, no signed URL) |
| **Metadata** | `messages.id`, `conversation_id`, `media_bucket_path`, `body` (nombre archivo o caption), `wa_message_id`, `created_at`, `direction` |
| **MIME** | Inferir de extensión en path (`.pdf`, `.docx`, …) o HEAD al objeto |
| **Fuera de alcance v3** | OCR, parsing ARCA, UI de comprobantes |

## Outbound + ticks (S6)
- Panel: inserta `messages` (`direction=out`, `delivery_status=pending`, `sent_by`) + fila `whatsapp_outbox` con `message_id` / `conversation_id`.
- Worker: drena outbox (texto + image/audio/document desde Storage); al enviar pone `wa_message_id` y `delivery_status=sent` (o `failed`).
- Evento `messages.update` (Baileys `WAMessageStatus`) → avanza `delivery_status` sent → delivered → read (no retrocede; `failed` queda). **1:1 only** en ese evento.
- **Grupos:** Baileys emite `message-receipt.update` (receipt por participante); el worker escucha ambos. Ticks de grupo = primer participante que entrega/lee (no espera a todos, tradeoff vs WA nativo).
- UI: ticks en el hilo vía Realtime INSERT/UPDATE en `messages` (JWT con `realtime.setAuth`).
- Lista (S10): preview + ticks del **último** mensaje si es saliente (embed `messages` limit 1); no hay `unread_count` CRM.

## Nuevo chat (S11)
- Panel: `startNewChat` normaliza E.164 AR (`lib/phone/ar-e164.ts`), upsert `contacts` + `conversations` (1:1 / `wa_chat_id` provisional `digits@s.whatsapp.net`), reusa `sendOutboundMessage` para el primer texto. UI: botón **+ Nuevo** en la bandeja.
- Worker: antes de `sendMessage` llama `onWhatsApp` (ya en outbox); al resolver, `bindResolvedPnJid` alinea `contacts.wa_jid` / `conversations.wa_chat_id` **solo si** el contacto del hilo tiene el mismo `to_e164`.
- **No en WhatsApp:** error `not_on_whatsapp:+E164` → outbox/mensaje `failed` → `cleanupNotOnWhatsAppOrphan` exige `message_id` outbound del mismo `conversation_id` + phone match; borra el mensaje y, si el hilo quedó vacío, la conversación; el contacto stub (sin agenda/push/verified/avatar) también. Contactos ya sincronizados por Baileys se conservan. Agentes no pueden DELETE bajo RLS; el cleanup es del worker.
- Redeploy VM tras pull: `cd workers/whatsapp-baileys && npm install && npm run build && pm2 restart whatsapp-ui-baileys`.

## Grupos (S12)
- Schema: `conversations.kind` (`direct`|`group`), `title`, `contact_id` nullable en grupos; `messages.wa_sender_jid` / `wa_sender_name`; outbox `to_jid` (XOR con `to_e164`).
- RLS: authenticated inserta solo `kind=direct`; trigger `conversations_guard_identity` bloquea mutar `kind`/`wa_chat_id`/`contact_id`/`title` desde JWT; grupos los escribe el worker (`service_role`).
- Inbound: ya no se skipean `@g.us`; `groupMetadata.subject` → title; participante → sender fields.
- Outbound: panel encola `to_jid=wa_chat_id`; worker revalida `to_jid` ↔ conversación `group` + `@g.us` (sin `onWhatsApp`).
- UI: filtro **Grupos**, badge “Grupo” en lista, autor entrante en el hilo. Sin admin de participantes.

## Citas + audio grabado (S13)
- Schema: `messages.quoted_message_id` / `quoted_wa_message_id` / `quoted_body_preview`; outbox `quoted_wa_message_id`. Bucket `whatsapp-media` acepta `audio/webm` (MediaRecorder del browser).
- Panel: botón **Citar** en burbujas con `wa_message_id`; composer muestra barra de cita; **Mic** graba ≤60s → upload Storage → outbox `type=audio`. Errores de permiso mic / send visibles.
- Worker outbound: `sock.sendMessage(jid, content, { quoted })` con WAMessage mínimo reconstruido desde el mensaje citado (Baileys README). **`quoted.key.remoteJid` debe ser el JID del chat donde vive el stanza** (`conversations.wa_chat_id` o `contacts.wa_lid` en 1:1 MD), **no** el PN resuelto por `onWhatsApp` — si se usa solo `@s.whatsapp.net`, Baileys no setea `contextInfo.remoteJid` y el destinatario ve texto plano. Log: `outbox_quoted_build` (`quoteChatJid` vs `sendJid`). **Audio CRM:** el browser graba `webm`; el worker transcodifica a `ogg/opus` (`ffmpeg-static`) y envía con `ptt: true` — WhatsApp no reproduce webm como nota de voz.
- Worker inbound: lee `contextInfo.stanzaId` → persiste quote fields.
- Redeploy VM tras pull: `cd workers/whatsapp-baileys && npm install && npm run build && pm2 restart whatsapp-ui-baileys`.
- **Smoke humano:** citar un mensaje y confirmar reply citado en el teléfono (1:1 LID y grupo); grabar mic y confirmar audio legible (webm = archivo, no burbuja PTT). Validado prod 2026-08-28 — ver [`adr/003-quoted-replies-lid-group-ticks.md`](adr/003-quoted-replies-lid-group-ticks.md). Responder vía menú contextual (S15) usa el mismo modo cita.

## Menú contextual del hilo (S15)
- Schema: `whatsapp_message_ops` (cola `forward` | `delete_for_me` | `delete_for_everyone`, patrón `whatsapp_label_ops`); `messages.deleted_at` (soft-delete al revocar para todos).
- Panel: click derecho o Shift+F10 en burbuja → **Responder** (modo cita), **Copiar** (clipboard + toast), **Reenviar** (modal selector de chat), **Eliminar** (submenú: para mí / para todos si es propio). Sin **Reaccionar** (v3). Botón inline “Citar” removido — acción unificada en el menú.
- Server actions: `app/actions/message-actions.ts` encola ops (requiere canal `connected`).
- Worker `message-ops.ts` (tick del worker, tras outbox/labels):
  - **Reenviar:** `sendMessage(jid, { forward: WAMessage })` reconstruido desde CRM + cache; insert fila `out` en conversación destino + actualiza preview.
  - **Eliminar para todos:** `sendMessage(jid, { delete: key })` → `deleted_at` + limpia body/media (stub en UI: *Se eliminó este mensaje.*).
  - **Eliminar para mí:** `chatModify({ delete: true, lastMessages })` → DELETE fila CRM (desaparece del hilo, como WA).
- Revokes remotos: `messages.update` (stub/revoke) → soft-delete; `messages.delete` → hard delete si aún no estaba revocado.
- Redeploy VM tras pull: `cd workers/whatsapp-baileys && npm install && npm run build && pm2 restart whatsapp-ui-baileys`.
- **Smoke humano:** prod 2026-08-28 — reenvío visible en destino; eliminar para todos deja stub; eliminar para mí quita burbuja.

## Contactos / nombres / avatares (S9)
- Campos: `agenda_name` (Baileys `Contact.name` = agenda del teléfono vinculado), `push_name` (`notify` / `message.pushName`), `verified_name` (`verifiedName`), `display_name` (UI: agenda → verified → push → E.164), `avatar_path` (Storage privado `avatars/{contactId}.jpg`).
- Eventos: `contacts.upsert` / `contacts.update` / **`messaging-history.set` (solo array `contacts`)** → `applyBaileysContactFields`. El inbound **ya no** pisa `display_name` con solo pushName si hay agenda.
- **Límite protocolo MD:** en multi-device a veces WA **no entrega** `Contact.name` (solo `notify`). Si pasa, UI cae a push/E.164; no es bug del CRM. Logs del worker: `contacts_sync_batch` (`with_agenda_name` / `with_push_name`) y `history_contacts_queued`.
- **Smoke agenda (2026-08-27):** en Supabase, 13 contactos con `push_name` pero **0** con `agenda_name` — el protocolo solo mandó push hasta ahora; tras redeploy con listener `messaging-history.set`, reconectar sesión y mirar logs. Si sigue en 0, los nombres guardados en WA coinciden con el push name o WA no expone agenda al dispositivo vinculado.
- Avatares: best-effort `profilePictureUrl` → bucket privado; UI usa iniciales si no hay foto. URLs firmadas en el panel (nunca públicas).

- Fuente: eventos Baileys `labels.edit` (catálogo) y `labels.association` tipo chat (`label_jid`) → tablas `labels` / `conversation_labels` (WA es verdad).
- Write: panel encola `whatsapp_label_ops` + cache local; worker llama `addChatLabel` / `removeChatLabel`. Env `WHATSAPP_LABELS_WRITE=0` o `whatsapp_connections.labels_write_enabled=false` → solo lectura/filtro (go-live no bloqueado).
- UI: búsqueda en lista (nombre / E.164 / preview); filtro No leídos = label WA + badge = chats con esa label en el top-80; atajo **Favoritos** si existe la label WA (mismo patrón; sin taxonomía CRM); menú Listas (incluye `COBRANZAS`; excluye No leídos / Favoritos ya promovidos); editor de etiquetas en el hilo.
- Verificar con hermes-fuente: Baileys 7 docs + `sock.addChatLabel` / events en `@whiskeysockets/baileys` autodocs.
- **Leído/no leído (S24 / ADR 004):** verdad operativa = unread nativo (teléfono / WA Web / companion). Label 14 «No leídos» es proyección CRM. Worker: `chats.update` `0`/`null` live; `messages.update` READ inbound; reconcile `messaging-history.set` `isLatest`; lookup LID+PN; write-back `whatsapp_label_ops`. Sentinel `-1` se ignora. El `0` de `chats.upsert` / history incompleto sigue siendo mentiroso. **Cierre BP4 2026-09-21:** Contable `crm_unread_labeled=0`; PM2 `team_read_wa_writeback` add+remove; 128× remove done / 7d. Copy UI «Leído desde el teléfono» = S25.

## Operación
- Ver estado / logs / reiniciar:
  ```bash
  pm2 status
  pm2 logs whatsapp-ui-baileys --lines 80
  pm2 restart whatsapp-ui-baileys
  ```
- Tras pull de S6 en la VM: `cd workers/whatsapp-baileys && npm install && npm run build &&` cargar `.env` + `pm2 restart whatsapp-ui-baileys`
- Reconectar: en el panel (admin) → Canal → Desconectar → Conectar / mostrar QR → escanear
- Ruta de la sesión: `WHATSAPP_AUTH_DIR` (env VM; típico bajo `appsPath/.../workers/whatsapp-baileys/auth`)
- Tras major de Baileys (p. ej. 6→7): wipe auth + re-QR
- Runtime: Node ≥ 20, worker ESM (`"type": "module"`), `npm run build` → `node dist/index.js`
- Env names (valores solo en VM `chmod 600`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_AUTH_DIR`, `BAILEYS_LOG_LEVEL`

## Problemas conocidos
| Síntoma | Causa | Solución |
| --- | --- | --- |
| 42501 en whatsapp_* / contacts | Falta grant `service_role` | Migraciones S3/S4; no solo `authenticated` |
| QR no aparece | Worker caído o URL Supabase distinta al panel | `pm2 logs`; alinear `SUPABASE_URL` |
| Soft reconnect muestra QR | Close handler bajó a `qr_pending` | Worker solo pone `last_error` “Reconectando…” |
| Teléfono “Esperando el mensaje” | Baileys 6 / sin `getMessage` | Pin ≥ 7 + cache por id del protobuf |
| Feed/hilo no se mueve sin F5 | Tabla fuera de `supabase_realtime` o sin JWT | Migración Realtime + `realtime.setAuth` |
| Saliente queda pending | Worker caído o contacto sin E.164 | Banner de canal; revisar `phone_e164` del contact |
| Reply sin cita en teléfono (solo texto) | `quoted.key.remoteJid` = PN de envío en chat LID (`@lid`) | Fix `f65fda3`: `wa_chat_id` / `contacts.wa_lid` en `buildQuotedMessage`; redeploy VM |
| Grupo saliente siempre ✓ (no ✓✓) | Solo se escuchaba `messages.update` (1:1) | Fix `bcace02`: `message-receipt.update`; tradeoff primer participante |
| Reenviado no aparece en chat destino | Forward sin insert CRM; solo `notify` en upsert | Fix `4dba2d4`: persist post-forward + `append` fromMe |
| Burbuja desaparece al eliminar para todos | DELETE hard en CRM | Fix `58219a8`: `deleted_at` + stub UI |
| Lista muestra “Sin nombre” o push raro | Agenda no llegó por MD / display pisado (pre-S9) | S9: `agenda_name`; redeploy worker; re-abrir sesión WA |
| CRM lento (~1 min) / bloqueado fuera 9–13 | Pacing global en `drainOutbox` (pre-fix) | **Hecho** ADR 007: pacing solo `client_ref` campaña; smoke Contable 2026-09-17 OK |

## Multi-sector (S19)
- Worker: `SECTOR_SLUG` (default `contable`) → `resolveWorkerSectorId`; una fila `whatsapp_connections` por sector (sin columna `singleton`).
- `claim_whatsapp_outbox` exige `p_sector_id` (además de `p_limit`); claims/reclaims de `whatsapp_*_ops` filtran por el mismo `sector_id`.
- Filas nuevas de contacts / conversations / messages / labels / outbox / ops llevan `sector_id` del sector del worker o de la connection del panel (default Contable hasta chooser S21).

## No verificable desde el repo
- Mensaje entrante **persistido** + visible en dos browsers sin F5 (smoke humano)
- Flujo A completo (documento inbound + respuesta con ticks) en producción
- Estado vivo de PM2 / auth dir en la VM
- Bytes concretos en Storage tras un adjunto real
