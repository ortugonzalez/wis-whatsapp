---
status: approved
architecture: docs/architecture.md
updated: 2026-09-25
---

# Implementation plan — WhatsApp CRM Template

## Rules

- One slice = one hermes-ship-slice.
- No BPs outside this plan without arquitecto.
- No product code until **architecture** and **this plan** are both approved for the wave in play.
- v1 (S1–S8) **done** / approved. v2 (S9–S14) **done** / closed 2026-08-27. Post-v2: **S15** done 2026-08-28; **S16** (team read CRM) done (native mirror amended in S24).
- **S17 (mobile + PWA)** — done 2026-09-21 (smoke install OK).
- **S18 (egress Free)** — S18a+S18b done; S18c cancelled this cycle.
- **S19–S23 (multi-sector)** — approved 2026-09-14; ADR 005; Path A; parallel to S18 operation; don't link 2nd Baileys until using the number.
- **S24–S25 (native read)** — done 2026-09-21.
- **S26–S28 (campaign labels + UI Lists)** — **approved** 2026-09-17; S26–S28 done.
- **K0–K8 (Cloud Channel ADR 008)** — **approved** 2026-09-21; K0–K8 done (K8 unread sync).
- **S29 (inbound sound)** — **approved** 2026-09-21; client-only; no Web Push; no Baileys.
- **S30–S31 (overflow reveal)** — **approved** 2026-09-21; desktop hover/focus only; **no** reveal on touch; UI-only.
- **S32–S35 (Free Fleet + Turnos Demo)** — **approved** 2026-09-25; health → logs → CRM sector → cross reminders with **guardia_samco** (that repo has its own contract/plan; S35 doesn't ship until alignment there).

- WhatsApp Baileys Channel: **hermes-baileys** + **hermes-fuente** on Baileys APIs.
- Cloud Channel (`kapso-demo`): **hermes-fuente** + Kapso/Meta docs; **no** hermes-baileys / **no** VM.
- Template UI: generic tokens (no WA green/dark clone).
- **Smoke outbound Baileys:** only `+5493469690201` (`docs/whatsapp-baileys.md`). **Smoke Cloud:** scope in K* slices (production number `5493469698257` / documented test destinations); don't mix with Sector A.
- **Turnos Demo:** canonical sign-up examples in `workers/ejemplos_mensajes_turnos.txt`. Reminders = ownership **guardia_samco**; this plan only integrates dual-DB worker / CRM.

## Slices

### S1–S8 — v1 (cerrado)

Ver historial del plan; todos `status: done`. No reabrir salvo cambio de contrato.

---

### S9 — Contactos agenda + avatares base
- **goal:** Separar nombre de agenda vs push name; pintar `display_name` con prioridad correcta; base de avatares.
- **depends_on:** [S5, S6]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `workers/whatsapp-baileys/`, `supabase/migrations/`, lista/header inbox
- **acceptance:**
  - [x] Columnas `agenda_name`, `verified_name` (y `avatar_path` si va en este slice); worker no pisa `display_name` con solo pushName.
  - [x] Eventos `contacts.upsert` / `contacts.update` (y history si aplica) actualizan agenda/push; UI lista/header usan prioridad del contrato.
  - [x] Smoke: build Next + worker OK; migración aplicada; límite MD documentado (smoke humano agenda tras redeploy VM).
  - [x] Avatar: foto en Storage privado o iniciales; sin URL pública anónima.
- **bps:**
  - [x] BP1 — Migración contactos + RLS/grants; helper `display_name` prioridad.
  - [x] BP2 — Worker: listeners contactos; dejar de copiar push→display ciego.
  - [x] BP3 — UI: lista/header usan `display_name`; avatar o iniciales.
  - [x] BP4 — Nota en `docs/whatsapp-baileys.md` sobre límites del protocolo MD / agenda.

### S10 — Lista tipo WhatsApp Web
- **goal:** Búsqueda, No leídos vía label WA + badge de cantidad, preview denso + ticks; chrome compacto (sin scroll de página).
- **depends_on:** [S9]
- **status:** done
- **gates:** []
- **paths_hint:** `app/(inbox)/`, `app/components/inbox/`
- **acceptance:**
  - [x] Buscador filtra por nombre, E.164, preview.
  - [x] Filtro No leídos sigue atado a la etiqueta WA; badge = cantidad de chats con esa label (no `unread_count` CRM ni “marcar leído al abrir”).
  - [x] Items de lista: hora + preview; ticks si el último es saliente.
  - [x] Layout viewport fijo se mantiene.
- **bps:**
  - [x] BP1 — UI búsqueda en lista.
  - [x] BP2 — Filtro No leídos (label WA) + badge de conteo desde `conversation_labels`.
  - [x] BP3 — Preview denso + ticks en lista; pulido header/composer ya iniciado.

### S11 — Nuevo chat
- **goal:** Iniciar 1:1 por E.164 desde el panel y enviar el primer mensaje.
- **depends_on:** [S6, S9]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/actions/`, composer/modal nuevo chat, worker `onWhatsApp`
- **acceptance:**
  - [x] Agente activo (cualquier rol agent/admin) ingresa E.164 AR válido → contact/conversation `direct` → outbox → legible en el teléfono.
  - [x] Número inexistente / no WA: error claro, sin fila basura o con cleanup documentado.
  - [x] RLS: solo authenticated activo crea `direct`.
- **bps:**
  - [x] BP1 — Action server: normalizar E.164, upsert contact/conversation, encolar mensaje.
  - [x] BP2 — UI “Nuevo chat” (modal/flujo corto).
  - [x] BP3 — Worker: asegurar resolución JID (`onWhatsApp`) antes de send si hace falta.

### S12 — Grupos
- **goal:** Dejar de ignorar grupos; listar, leer y responder; filtro Grupos.
- **depends_on:** [S5, S10]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** worker inbound, migrations `conversations.kind`, UI lista/hilo
- **acceptance:**
  - [x] Mensaje de grupo aparece en bandeja con título; no crashea el worker.
  - [x] Agente puede responder; outbound llega al grupo.
  - [x] Autor entrante visible en el hilo.
  - [x] Filtro Grupos; sin admin de participantes desde el CRM.
  - [x] RLS actualizado.
- **bps:**
  - [x] BP1 — Schema `kind`/`title`/sender en messages + policies.
  - [x] BP2 — Worker: ingest grupos (dejar de skip-only); metadatos mínimos.
  - [x] BP3 — Outbox/send a JID de grupo.
  - [x] BP4 — UI lista/hilo/filtro Grupos.

### S13 — Citas (reply) + audio grabado
- **goal:** Citar un mensaje al responder; grabar audio corto desde el composer.
- **depends_on:** [S6, S12]
- **status:** done
- **gates:** []
- **paths_hint:** thread-view, composer, outbox types, worker send quoted/audio
- **acceptance:**
  - [x] UI permite elegir mensaje y enviar cita; se ve en CRM; en WA si el protocolo lo permite (verificar **hermes-fuente**).
  - [x] Grabar → upload Storage privado → outbox audio → legible en el teléfono.
  - [x] Errores de permiso mic / fallos de send visibles.
- **bps:**
  - [x] BP1 — Modelo quote + render en hilo.
  - [x] BP2 — Composer: modo cita + worker send quoted.
  - [x] BP3 — Grabación audio browser → Storage → outbox → worker.

### S14 — Favoritos rápido
- **goal:** Atajo de filtro Favoritos si existe la label WA.
- **depends_on:** [S7, S10]
- **status:** done
- **gates:** []
- **paths_hint:** `inbox-with-label-filter` / chips de filtro
- **acceptance:**
  - [x] Si hay label Favoritos (o equivalente), chip/filtro usable junto a No leídos / Listas.
  - [x] Si no hay label, no se inventa taxonomía CRM.
- **bps:**
  - [x] BP1 — Detectar label Favoritos y exponer filtro rápido (sin duplicar catálogo).

### S15 — Menú contextual del hilo (reply / copiar / reenviar / eliminar)
- **goal:** Click derecho (o Shift+F10) en burbuja → acciones de oficina; reenvío y borrado vía worker Baileys; stub al eliminar para todos (como WA Web).
- **depends_on:** [S6, S13]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `thread-view`, `message-context-menu`, `app/actions/message-actions.ts`, `workers/whatsapp-baileys/src/message-ops.ts`, migraciones `whatsapp_message_ops`, `messages.deleted_at`
- **acceptance:**
  - [x] Menú: Responder (modo cita), Copiar (+ toast), Reenviar (selector de chat), Eliminar (para mí / para todos según propio/ajeno). Sin Reaccionar (v3).
  - [x] Ítems deshabilitados con razón si falta `wa_message_id` o canal desconectado.
  - [x] Reenviar llega al destino en WA y aparece en CRM del chat destino.
  - [x] Eliminar para todos deja stub *Se eliminó este mensaje.*; eliminar para mí quita la fila del hilo.
  - [x] Smoke humano prod 2026-08-28 OK.
- **bps:**
  - [x] BP1 — UI menú contextual + toast copia + modal reenvío.
  - [x] BP2 — Cola `whatsapp_message_ops` + server actions.
  - [x] BP3 — Worker: forward / delete Baileys + persist forward + soft-delete `deleted_at`.

### S16 — Lectura CRM alineada con WA «No leídos»
- **goal:** Leído/no leído alineado a WA; atribución CRM. Espejo nativo y copy «Leído desde el teléfono» enmendados en S24–S25 (ADR 004, 2026-09-16).
- **depends_on:** [S10]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** migración team_read + sync WA, `team-read-actions`, worker `labels.ts`, lista/hilo, ADR 004
- **acceptance:**
  - [x] Abrir hilo / marcar leído quita label WA «No leídos» y atribuye al agente.
  - [x] Marcar no leído agrega label WA y muestra badge.
  - [x] Lectura fuera del CRM → atribución WA (copy unificado a «Leído desde el teléfono» en S25).
  - [x] Backfill de chats ya etiquetados No leídos.
  - [x] Filtro chip «No leídos» sigue siendo conteo de chats con la label.
- **bps:**
  - [x] BP1 — Cursor + `team_read_via` + RPC WA sync + backfill.
  - [x] BP2 — Actions sync label WA.
  - [x] BP3 — Worker sync on unread label add/remove.
  - [x] BP4 — UI badge gated + copy atribución + docs.

### S17 — Mobile UX + PWA instalable (sin push)
- **goal:** App usable en phone/narrow + PWA standalone instalable; Web Push fuera de alcance.
- **depends_on:** [S10, S16]
- **status:** done
- **gates:** [ux-mobile, identidad]
- **paths_hint:** `app/layout.tsx`, `app/manifest.ts`, `public/sw.js`, `app/components/pwa/`, `app/components/inbox/*`, `app/login/`, `app/globals.css`
- **acceptance:**
  - [x] Viewport PWA-native + safe-area; checklist hermes-ux-mobile sin blockers.
  - [x] Long-press menú chat/mensaje en touch; header mobile sin overflow.
  - [x] Manifest standalone + icons; SW scope `/`; offline shell; sin cache auth/API.
  - [x] Desktop intacto; smoke install (Android Chrome / iOS Add to Home Screen).
- **bps:**
  - [x] BP1 — Viewport + CSS safe-area / active / overflow-x / inputs ≥16px.
  - [x] BP2 — Touch targets + header overflow menu + long-press context menus.
  - [x] BP3 — Manifest tune + `sw.js` + register client + `offline.html`.
  - [x] BP4 — Smoke install + flujo bandeja→hilo→responder en device real.

### S18a — Worker event-driven (egress)
- **goal:** Dejar el tick fijo 4 s; despertar el drain por Realtime + poll de seguridad lento; sin HTTP público en la VM.
- **depends_on:** [S6]
- **status:** done
- **gates:** [optimizador]
- **paths_hint:** `workers/whatsapp-baileys/src/index.ts`, outbox/ops drain modules, `docs/whatsapp-baileys.md`, `docs/runbook-whatsapp-vm.md`
- **acceptance:**
  - [x] Suscripción Realtime (service role / JWT worker) a `whatsapp_outbox`, `whatsapp_label_ops`, `whatsapp_chat_read_ops`, `whatsapp_message_ops` (+ connection si aplica); evento → `tick`/drain.
  - [x] Poll de seguridad ~60–120 s (intervalo final en BP + smoke); **no** vuelve el 4 s fijo en idle.
  - [x] Envío CRM / label / read / message-op sigue funcionando con latencia de oficina.
  - [x] Redeploy PM2 en VM; nota en runbook/baileys doc.
  - [x] Evidencia: Logs Explorer — REST a esas rutas en idle cae órdenes de magnitud vs baseline ~40k/tabla/día.
- **bps:**
  - [x] BP1 — Cablear cliente Realtime en worker; auth estable; handlers → drain; cleanup al shutdown.
  - [x] BP2 — Reemplazar `TICK_MS=4000` por poll seguridad + wake por evento; backoff/reconnect documentado.
  - [x] BP3 — Smoke VM: idle quieto + un mensaje outbox + una label op; medir paths REST ~1 h idle.
  - [x] BP4 — Actualizar `docs/whatsapp-baileys.md` + runbook (sin webhook a la VM).

### S18b — Inbox lista por diff (egress UI)
- **goal:** Dejar de refetchar 80 chats + labels + unread en cada evento Realtime; patch de fila; refresh solo seguridad.
- **depends_on:** [S10, S18a]
- **status:** done
- **gates:** [optimizador]
- **paths_hint:** `app/components/inbox/inbox-with-label-filter.tsx`, helpers lista/unread, `lib/contacts/avatar-url.ts` / signed URL cache
- **acceptance:**
  - [x] INSERT/UPDATE mensaje o conversation: actualiza preview/orden/ticks/unread de esa fila sin `refresh()` total.
  - [x] Cambio `conversation_labels`: ajusta `labelIds` / filtro No leídos de ese chat sin full fetch.
  - [x] Refresh de seguridad: al foco de tab (y/o debounce raro); lista coherente tras rarezas.
  - [x] Cache liviano de signed URLs de avatares en la sesión de lista (no re-firmar en cada patch).
  - [x] Smoke: panel abierto + mensajes entrantes; Network no muestra rafaga de `conversations?select=…` por evento.
- **bps:**
  - [x] BP1 — Handlers Realtime usan payload / fetch 1 fila; quitar `refresh()` del camino feliz.
  - [x] BP2 — Labels + unread: patch o RPC acotado; refresh seguridad al `visibilitychange`/foco.
  - [x] BP3 — Cache signed avatar URLs en estado de lista; smoke Network.

### S18c — Mudanza org Free (condicional)
- **goal:** Si el ciclo actual está restricted, mover a **otra org Free** con cuota limpia **después** de S18a; costo $0.
- **depends_on:** [S18a]
- **status:** cancelled
- **gates:** [seguridad]
- **paths_hint:** Supabase dashboard, `orchestra.json`, `.env` / Vercel / VM secrets, Storage mirror, Auth Google
- **acceptance:**
  - [x] Solo ejecutar si Percy confirma restricted (402 / grace) **o** pide mudanza explícita; si no → skip / cancel slice.
  - [ ] Nueva org Free + proyecto; dump/restore schema+data; Storage copiado; Google OAuth redirect URLs.
  - [ ] Secrets Vercel + worker VM; `orchestra.json` projectRef; pause/delete proyecto viejo cuando smoke OK.
  - [ ] Smoke: login allowlist, inbox, envío, Realtime worker (S18a) en el proyecto nuevo.
  - [ ] No crear segundo proyecto en la **misma** org como “reset” (no resetea egress).
- **bps:**
  - [x] BP1 — Runbook migrate (checklist) + confirmación restricted. *(cancelado: sin confirmación restricted en este ciclo; reabrir si hace falta)*
  - [ ] BP2 — Provision org/proyecto + restore DB/Storage + Auth.
  - [ ] BP3 — Cutover secrets + smoke + actualizar orchestra; decommission viejo.

### S19 — Schema sectors + migrate Contable
- **goal:** Introducir `sectors` / `sector_memberships`, `sector_id` en tablas WA, seed Contable + Equipo técnico · centros, backfill datos actuales → `contable`, eliminar singleton de `whatsapp_connections`.
- **depends_on:** [S6, S18a]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `supabase/migrations/`, `lib/supabase/types.ts`, ADR 005
- **acceptance:**
  - [x] Filas seed con slugs/display_name del contrato.
  - [x] Toda fila WA existente tiene `sector_id` = Contable; `eq-tecnico-centros` sin chats.
  - [x] Dos filas `whatsapp_connections` posibles (Contable existente + placeholder técnico).
  - [x] Types regenerados; app/worker no asumen singleton.
- **bps:**
  - [x] BP1 — Migración sectors + memberships + FKs/`sector_id` + backfill Contable.
  - [x] BP2 — Drop singleton; connection por sector; grants mínimos.
  - [x] BP3 — Regenerar types + nota en `docs/whatsapp-baileys.md`.

### S20 — RLS membership + sector activo (cookie)
- **goal:** Policies por membership; helper server de sector activo (cookie httpOnly); queries/actions exigen sector válido.
- **depends_on:** [S19]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** migrations RLS, `lib/` session/sector helpers, middleware o layout gate
- **acceptance:**
  - [x] Usuario sin membership al sector activo no lee esas filas (probar con segundo profile).
  - [x] Cookie inválida o sector no miembro → redirect a elegir / denied.
  - [x] Admin con ambos memberships puede acceder a ambos **solo** cambiando sector activo.
- **bps:**
  - [x] BP1 — Policies RLS en tablas WA + memberships.
  - [x] BP2 — Cookie/sesión sector activo + validación server.
  - [x] BP3 — Wire actions/loaders inbox a filtrar por sector activo.

### S21 — Choose-on-login + switcher
- **goal:** Pantalla elegir sector si >1 membership en cada login; switcher in-app sin re-OAuth; limpia cache/Realtime.
- **depends_on:** [S20]
- **status:** done
- **gates:** [identidad]
- **paths_hint:** `app/login/` o ruta `/select-sector`, chrome inbox header
- **acceptance:**
  - [x] 1 membership → inbox directo con cookie seteada.
  - [x] >1 → chooser obligatorio post-login; labels Contable / Equipo técnico · centros.
  - [x] Switcher cambia sector, recarga bandeja correcta, sin prompt Google.
  - [x] Mobile usable (touch target switcher).
- **bps:**
  - [x] BP1 — Flujo post-auth + página chooser.
  - [x] BP2 — Botón cambiar cuenta + invalidación cliente Realtime/cache.
  - [x] BP3 — Smoke desktop + narrow.

### S22 — Settings: memberships + WhatsApp por sector
- **goal:** Admin asigna sectores a usuarios; pantalla WhatsApp opera connection del sector activo.
- **depends_on:** [S20, S21]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/settings/users/`, `app/settings/whatsapp/`, profile-actions
- **acceptance:**
  - [x] Alta/edición usuario incluye memberships (checkboxes sectores).
  - [x] Seed: `your-admin@domain.com` en ambos sectores (verificado SQL remoto).
  - [x] Connect/disconnect/QR afectan solo la connection del sector activo (API `requireActiveSectorApi` + UI muestra `display_name`).
  - [x] Agente no-admin no ve settings de canal (`requireAdmin` + links solo admin).
  - [x] Smoke: `npm run build` OK. Nota humana: agente Contable-only no ve técnico vía membership/RLS (switcher ausente).
- **bps:**
  - [x] BP1 — UI + actions memberships.
  - [x] BP2 — WhatsApp settings scoped a sector activo.
  - [x] BP3 — Smoke admin: membership agente Contable-only no ve técnico.

### S23 — Worker SECTOR_SLUG + segunda VM
- **goal:** Worker lee `SECTOR_SLUG` + auth dir propio; Contable redeploy OK; provisionar 2ª e2-micro para `eq-tecnico-centros` (QR cuando el número exista).
- **depends_on:** [S19, S18a]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `workers/whatsapp-baileys/`, `orchestra.json` services, runbook VM, ADR 001/005
- **acceptance:**
  - [x] Worker Contable solo toca filas `contable`; Realtime wake sigue OK.
  - [x] Orchestra documenta ambas VMs (host/user/pm2/auth).
  - [x] 2ª VM creada (o checklist listo) sin 2 PM2 en la primera.
  - [x] Vincular QR técnico es paso explícito post-número; hasta entonces no suma egress de 2º socket.
  - [x] Runbook actualizado.
- **bps:**
  - [x] BP1 — Worker binding sector + filtros outbox/ops/connection.
  - [x] BP2 — Redeploy Contable + smoke envío.
  - [x] BP3 — Provision 2ª e2-micro + PM2 + secrets; orchestra + runbook.
  - [ ] BP4 — (Cuando exista el número) QR `eq-tecnico-centros` + smoke inbound/outbound.

### S24 — Espejo nativo leído/no leído (worker + reconcile)
- **goal:** Teléfono o WA Web en 0 no leídos ⇒ CRM 0; repro de N vs 0 se reconcilia sin abrir chat por chat.
- **depends_on:** [S16]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `workers/whatsapp-baileys/src/{labels,socket,outbox,native-unread-suppress}.ts`, lookup JID, ADR 004
- **acceptance:**
  - [x] Entrante → CRM no leído; leer en **celular** → CRM 0 + atribución `team_read_via=whatsapp`.
  - [x] Mismo flujo leyendo en **WhatsApp Web**.
  - [x] Leer / marcar no leído en CRM → celular y WA Web a 0 (cola `whatsapp_chat_read_ops` + label; verificar LID + `lastMessages`).
  - [x] Caso repro: bandeja con N (prod ~46) y teléfono en 0; tras deploy/reconnect (`isLatest`) el CRM baja a 0.
  - [x] Mark-read CRM no se reescribe como lectura externa; sentinel `-1` no dispara no-leído falso.
  - [x] Ticks de salientes (`messages.delivery_status`) intactos; `messages.update` READ inbound no los toca.
- **bps:**
  - [x] BP1 — Interpretación `unreadCount` (`0` / `null` live / skip `-1` / backfill `0` solo pre-`isLatest`) + tests worker.
  - [x] BP2 — `messages.update` READ inbound (`fromMe: false`) → espejo leído nativo (no `delivery_status`).
  - [x] BP3 — Reconcile post-`isLatest` + lookup LID y PN + log `unknown_chat`.
  - [x] BP4 — Write-back `remove`/`add` label 14 al espejo nativo; redeploy VM + smoke (prod 2026-09-21: Contable `crm_unread_labeled=0`; 128× `remove` done / 7d; PM2 `team_read_wa_writeback` add+remove; `npx tsx src/native-unread.test.ts` OK).
- **ship_note:** Código write-back en `main` @ e06716d; VM Contable @ 5e829f4 (ancestro incluye e067); cierre BP4 por telemetría + selfcheck 2026-09-21.

### S25 — Copy atribución «Leído desde el teléfono»
- **goal:** Unificar «Leído desde WhatsApp» → «Leído desde el teléfono» (celular o WA Web).
- **depends_on:** [S24]
- **status:** done
- **gates:** []
- **paths_hint:** `lib/inbox/team-read.ts`, `lib/inbox/team-read.test.ts`, hilo inbox
- **acceptance:**
  - [x] Hilo con `team_read_via=whatsapp` muestra «Leído desde el teléfono».
  - [x] `via=crm` sigue «Leído por &lt;nombre&gt;»; `via=null` sin línea.
- **bps:**
  - [x] BP1 — Copy + test.

### S26 — RPCs labels por sector + `crm_label_id` en enqueue
- **goal:** Exponer a cobranzas (`service_role`) list/create de labels del sector y extender `enqueue_sector_text` con `p_crm_label_id` persistido en outbox; sin assign en la RPC.
- **depends_on:** [S19, enqueue_sector_text]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `supabase/migrations/`, `docs/whatsapp-baileys.md` (contrato RPC), types
- **acceptance:**
  - [x] `list_sector_labels(p_sector_slug)` → filas `{id,name,color,created_at}` del sector; solo `service_role`.
  - [x] `create_sector_label`: get-or-create por nombre (trim + case-insensitive); color WA 0–19 o default; insert optimistic + cola create catálogo (worker en S27); sin grants anon/authenticated.
  - [x] `whatsapp_outbox.crm_label_id` nullable FK → `labels`; `enqueue_sector_text` acepta `p_crm_label_id` default null; si not null valida label.sector = sector del slug y persiste; null = comportamiento actual.
  - [x] Label de otro sector / id inexistente → fail-fast RPC; **no** escribe `conversation_labels` en enqueue.
  - [x] Wrapper `enqueue_contable_text` sigue compat (param nuevo default null).
  - [x] Smoke SQL: create Contable «Cobranzas» → id; enqueue con id → outbox pending con `crm_label_id` y sin chip aún.
- **bps:**
  - [x] BP1 — Migración columna `crm_label_id` + grants/comentarios.
  - [x] BP2 — RPCs `list_sector_labels` / `create_sector_label` (security definer, revoke public/anon/authenticated, grant service_role).
  - [x] BP3 — Extender `enqueue_sector_text` (+ wrapper contable) con validación sector de label.
  - [x] BP4 — Nota contrato en `docs/whatsapp-baileys.md` + regenerar types si aplica.

### S27 — Worker: create catálogo + assign post-sent
- **goal:** Drenar create de labels Business (`addLabel`) y, tras mark `sent` exitoso, assign idempotente de `outbox.crm_label_id` al hilo (cache + `whatsapp_label_ops` / `addChatLabel`); fallo assign no revierte sent.
- **depends_on:** [S26]
- **status:** done
- **gates:** []
- **paths_hint:** `workers/whatsapp-baileys/src/{labels,outbox,db}.ts`, ops de catálogo si hace falta tabla/cola
- **acceptance:**
  - [x] Create pending → worker `addLabel` → `labels.edit` / fila usable con `wa_label_id` real; si smoke falla → activar fallback fail-fast (create RPC = solo get) documentado sin taxonomía solo-CRM.
  - [x] Tras `sent` con `crm_label_id`: upsert `conversation_labels` + encolar/op `add` espejo Business (mismo patrón que toggle panel); idempotente.
  - [x] Sin `crm_label_id` → sent sin assign automático.
  - [x] Fallo assign: log; status outbox permanece `sent`; reintento posterior OK.
  - [x] Smoke humano brief **solo** a `+5493469690201`: (1) create (2) enqueue+id pending sin chip (3) drain → chip (+ teléfono si write) (4) sin id (5) cross-sector fail.
  - [x] Redeploy worker sector Contable (y doc Tesorería si aplica) tras merge.
- **bps:**
  - [x] BP1 — Cola/drain create catálogo (`addLabel`) + manejo error → estado no usable / fallback path.
  - [x] BP2 — Hook post-sent: assign por `crm_label_id` (conversation del outbox) idempotente.
  - [x] BP3 — Smoke Contable del Ready-when; documentar resultado create OK o fallback fail-fast en `docs/whatsapp-baileys.md`.

### S28 — UI Agregar a lista / + Nueva lista (menú ⋮)
- **goal:** Desde el menú de opciones de cada chat en la bandeja, asignar/quitar listas Business y crear una lista nueva solo con nombre.
- **depends_on:** [S26]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/components/inbox/conversation-context-menu.tsx`, `conversation-list.tsx`, `label-actions.ts` (create), reuso patrones `label-chips.tsx`
- **acceptance:**
  - [x] ⋮ → **Agregar a lista** lista las labels del sector activo; toggle assign/remove vía `toggleConversationLabel` (o equivalente); chip en fila actualiza.
  - [x] **+ Nueva lista** → input nombre → server action autenticada: get-or-create en sector + cola `whatsapp_label_catalog_ops` si nueva; color default `0`; sin `service_role` en client.
  - [x] Write disabled / empty / error / Escape documentados en UI.
  - [x] Smoke humano solo `+5493469690201`: assign + create nombre nuevo.
  - [x] Excluir etiqueta sistema «No leídos» del panel de assign (mismo criterio Listas filtro / chips).
- **bps:**
  - [x] BP1 — Extender menú contexto: submenu/panel Agregar a lista + toggles.
  - [x] BP2 — Server action `createSectorLabel` (auth + sector membership) + wire **+ Nueva lista**.
  - [x] BP3 — Smoke UI + nota breve en `docs/whatsapp-baileys.md` / README Inbox si aplica.

---

## Cloud Channel (ADR 008) — approved 2026-09-21

Order: K1→K7 in whatsapp-ui; Collections D1–D4 **after** (other repo). Ship-plan cap 5/run.

### K0 — ADR 008 Contract
- **goal:** ADR + architecture multi-provider amendment.
- **depends_on:** []
- **status:** done
- **gates:** []
- **paths_hint:** `docs/adr/008-kapso-channel-provider.md`, `docs/architecture.md`
- **acceptance:**
  - [x] ADR 008 `status: approved`; architecture `kapsoChannel: approved`.
- **bps:**
  - [x] BP1 — ADR + architecture (2026-09-21).

### K1 — Schema provider + seed `kapso-demo`
- **goal:** `channel_provider` in sectors; seed Cloud sector + connection no VM; types/helpers read provider; orchestra Cloud secrets (names only).
- **depends_on:** [K0]
- **status:** done
- **gates:** [security]
- **paths_hint:** `supabase/migrations/`, `lib/sectors/`, `.cursor/orchestra.json`, `.env.example`
- **acceptance:**
  - [x] Column `sectors.channel_provider` (`baileys`\|`cloud`, default `baileys`); existing rows = baileys.
  - [x] Seed `kapso-demo` / display `Collections · Cloud`; `whatsapp_connections` disconnected + `phone` snapshot `+5493469698257` (or digits doc); minimal Cloud columns (`kapso_phone_number_id` nullable text).
  - [x] Membership admin `your-admin@domain.com` to sector (same pattern Treasury).
  - [x] `SectorRow` / selects include `channel_provider`; no Baileys break.
  - [x] Orchestra + `.env.example`: `CLOUD_API_KEY`, `CLOUD_PHONE_NUMBER_ID`, `CLOUD_WEBHOOK_SECRET` (names only; no values).
  - [x] Smoke: migration apply or SQL verify seed; build OK; **no** VM / **no** worker SECTOR_SLUG=kapso-demo.
- **bps:**
  - [x] BP1 — Migration channel_provider + seed sector/connection/membership + ADR 008 comments.
  - [x] BP2 — Lib/types SectorRow + Cloud connection fields; UI guards don't assume QR if cloud (min: expose provider).
  - [x] BP3 — orchestra.json secrets + `.env.example`; brief note `docs/whatsapp-baileys.md` or `docs/kapso-channel.md` stub (names only).

### K2 — Ingress webhook Kapso
- **goal:** Route Handler público firmado; upsert contact/conversation/message; idempotency; Realtime.
- **depends_on:** [K1]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/api/webhooks/kapso/`, `lib/kapso/`
- **acceptance:**
  - [x] POST verifica HMAC `X-Webhook-Signature` (raw body); 401 si inválida.
  - [x] Eventos `whatsapp.message.received` (+ sent si llega) → upsert scoped `kapso-8257`; dedupe `(sector_id, wa_message_id=wamid)`.
  - [x] Idempotencia `X-Idempotency-Key` (tabla o unique); 200 rápido.
  - [x] Sin session cookie; secret solo server; no service_role en client.
  - [x] Smoke: firma bad→401; firma ok + payload mínimo→fila message; build OK.
- **bps:**
  - [x] BP1 — Verify signature + raw body route; tabla/store idempotency keys (o unique wamid).
  - [x] BP2 — Map payload Kapso → contacts/conversations/messages (inbound).
  - [x] BP3 — Smoke unit/self-check firma + nota docs.

### K3 — Egress humano + ticks
- **goal:** Envío texto (media básico si cabe) vía Kapso HTTP desde panel; wamid; status webhooks; gate 24h stub o check `last_inbound_at`.
- **depends_on:** [K2]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/actions/`, `lib/kapso/`, outbox drain panel
- **acceptance:**
  - [x] Agente miembro envía texto en hilo Kapso → API Kapso → message con wamid + `sent_by`.
  - [x] Fuera de ventana 24h: fail claro (sin silent success); dentro: OK.
  - [x] Webhooks sent/delivered/read/failed actualizan ticks/status.
  - [x] Cola liviana / pending+retry documentada; sin worker Baileys.
  - [x] Smoke build + self-check; envío live opcional documentado.
- **bps:**
  - [x] BP1 — Client Kapso server-only sendText (+ media mínimo si BP pequeño).
  - [x] BP2 — Composer/action path solo si `channel_provider=kapso`; gate 24h.
  - [x] BP3 — Status webhook handlers + smoke.

### K4 — Settings canal Kapso
- **goal:** Settings WhatsApp del sector activo Kapso muestra CONNECTED/quality (no QR); refresh status desde Kapso API.
- **depends_on:** [K1]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `app/settings/whatsapp/`, `lib/kapso/`
- **acceptance:**
  - [x] Sector Baileys: UI QR intacta.
  - [x] Sector Kapso: sin QR; status + phone + quality/tier si API da; botón refresh.
  - [x] Connect/disconnect Baileys no aplican / disabled en Kapso.
  - [x] Smoke UI build; membership denied OK.
- **bps:**
  - [x] BP1 — Branch UI settings por `channel_provider`.
  - [x] BP2 — Server action refresh phone status Kapso.
  - [x] BP3 — Smoke build.

### K5 — Mirror + atribución
- **goal:** Outbound cobranzas/GAS visibles en hilo; UI autor humano vs Cobranzas/Sistema.
- **depends_on:** [K2, K3]
- **status:** done
- **gates:** []
- **paths_hint:** `lib/kapso/`, inbox message row
- **acceptance:**
  - [x] Webhook/outbound sin `sent_by` CRM se inserta/espeja con origen `cobranzas`\|`system` (heurística `biz_opaque` / sin match).
  - [x] UI: nombre agente | «Cobranzas» | «Sistema» (GAS/otros).
  - [x] No oculta templates; un solo hilo.
  - [x] Smoke: fixture outbound mirror + render.
- **bps:**
  - [x] BP1 — Persist `origin`/`source` en messages (columna o metadata) + map webhook outbound.
  - [x] BP2 — UI atribución en hilo.
  - [x] BP3 — Smoke/self-check.

### K6 — Backfill historial Kapso
- **goal:** Importar gaps desde Kapso messages API al sector `kapso-8257`.
- **depends_on:** [K2, K5]
- **status:** done
- **gates:** [seguridad]
- **paths_hint:** `lib/kapso/`, admin action o script documentado
- **acceptance:**
  - [x] Job/action admin: page Kapso history → upsert idempotente por wamid.
  - [x] No duplica; media best-effort o skip documentado.
  - [x] Smoke: dry-run o 1 página; build OK.
- **bps:**
  - [x] BP1 — Client list/query messages Kapso.
  - [x] BP2 — Upsert loop + admin trigger.
  - [x] BP3 — Doc runbook + smoke.

### K7 — UX ventana 24h
- **goal:** Composer Kapso bloqueado/aviso fuera de ventana; copy claro.
- **depends_on:** [K3]
- **status:** done
- **gates:** []
- **paths_hint:** `app/components/inbox/`
- **acceptance:**
  - [x] Fuera 24h: composer disabled o send blocked + copy (template = cobranzas, no panel).
  - [x] Dentro: enviar normal.
  - [x] Baileys sectors sin cambio.
  - [x] Smoke UI build.
- **bps:**
  - [x] BP1 — Derive window from last inbound.
  - [x] BP2 — Wire composer + copy.
  - [x] BP3 — Smoke.

### K8 — Unread Kapso ↔ CRM (inbox nativo)
- **goal:** Sync bidireccional leído/no leído entre bandeja CRM y inbox nativo Kapso (`inbox.kapso.ai`), reusando proyección ADR 004; sin romper Baileys.
- **depends_on:** [K2, K3, K7]
- **status:** done
- **gates:** []
- **paths_hint:** `lib/kapso/{mark-read,crm-unread,get-message,ingest-message}.ts`, `app/actions/{team-read-actions,kapso-unread-reconcile}.ts`, `app/components/inbox/inbox-with-label-filter.tsx`, migración label + `kapso_conversation_id`
- **acceptance:**
  - [x] Inbound Kapso → badge/filtro «No leídos» en CRM (label proyección sector).
  - [x] Abrir/marcar leído CRM → `markRead` Kapso (inbox nativo deja de mostrar no leído).
  - [x] Marcar leído / abrir en Kapso inbox nativo → CRM converge (reconcile on focus vía `kapso.status=read`).
  - [x] Anti-loop CRM→Kapso; Baileys path intacto (`whatsapp_chat_read_ops` solo baileys).
  - [x] Smoke selfcheck + build; embed Kapso fuera de alcance.
- **bps:**
  - [x] BP1 — Seed label «No leídos» kapso + `kapso_conversation_id`; helpers markRead / CRM label.
  - [x] BP2 — `markConversationRead/Unread` branch kapso; ingest unread on inbound.
  - [x] BP3 — Reconcile B→A on visibility + docs + smoke.

### S29 — Inbound beep
- **goal:** Short sound when inbound arrives in another chat; mute/unmute in list header; preference per sector in `localStorage`.
- **depends_on:** [S18b]
- **status:** done
- **gates:** []
- **paths_hint:** `app/components/inbox/inbox-with-label-filter.tsx`, helper prefs/audio under `lib/inbox/` or `app/components/inbox/`, `public/sounds/`
- **acceptance:**
  - [x] Toggle in search row (next to New chat): bell/speaker icon; `aria-pressed` + clear `aria-label` (e.g., "Enable sound" / "Mute notifications"); keyboard.
  - [x] Persistence `localStorage` key by `sector_id`; default ON; refresh keeps state.
  - [x] Realtime INSERT `messages` with `direction === "in"` and active sector → beep if ON and `conversation_id` ≠ active chat (`/c/[id]`).
  - [x] OFF → zero `play()`; outbound / UPDATE → silence; active chat → silence.
  - [x] Light asset in `/public/sounds/`; `HTMLAudioElement`; unlock on first interaction if autoplay blocks; catch without breaking UI.
  - [x] Smoke: ON + message other chat (focus and background) sounds; OFF doesn't; refresh preserves; build Next OK.
  - [x] No worker/Baileys changes; no Web Push; no settings.
- **bps:**
  - [x] BP1 — Helper pref per sector + unlock/play safe + asset in `/public/sounds/`.
  - [x] BP2 — Accessible toggle in list header; wire state.
  - [x] BP3 — Hook Realtime INSERT list: filter inbound + active chat; smoke checklist.

### S30 — OverflowReveal pattern + critical inbox
- **goal:** Reusable wrapper showing tooltip only if text is truncated; adopt in list (name/preview/chips) and thread header. Desktop hover + focus; no reveal on touch.
- **depends_on:** []
- **status:** done
- **gates:** [a11y]
- **paths_hint:** `app/components/inbox/overflow-reveal.tsx`, `conversation-list.tsx`, `app/(inbox)/c/[conversationId]/page.tsx`
- **acceptance:**
  - [x] Component/wrapper: measures overflow on-demand; portal only if truncated; hover delay; Escape/blur/leave closes; `role="tooltip"` + keyboard focus.
  - [x] One portal at a time; no mounting tooltips per row on list render.
  - [x] List: name, preview, label chips; remove ad-hoc `title=` from chips.
  - [x] Thread header: name + subtitle truncated.
  - [x] Pointer coarse / touch: no overflow portal.
  - [x] Read-only (no copy); generic tokens; no layout redesign.
  - [x] Smoke desktop + Tab/Escape; build Next OK.
- **bps:**
  - [x] BP1 — Implement `OverflowReveal` (measurement + portal + basic a11y).
  - [x] BP2 — Adopt in `conversation-list` (name/preview/chips).
  - [x] BP3 — Adopt in thread header; smoke checklist + a11y gate.

### S31 — OverflowReveal rest of surfaces
- **goal:** Extend pattern to document filename, sector switcher, truncated settings rows; quote composer optional.
- **depends_on:** [S30]
- **status:** done
- **gates:** []
- **paths_hint:** `message-document.tsx`, `sector-switcher.tsx`, `users-settings-client.tsx`, `composer.tsx` (quote, optional)
- **acceptance:**
  - [x] Document filename truncated → desktop tooltip if overflow.
  - [x] Sector switcher label truncated → same pattern.
  - [x] Settings users rows truncated → same pattern.
  - [x] Quote preview composer: adopt or document conscious skip.
  - [x] Touch no reveal; long-press menus intact.
  - [x] Smoke + build OK.
- **bps:**
  - [x] BP1 — Document + sector switcher.
  - [x] BP2 — Settings (+ quote optional); smoke wave close.

### S32 — Anti-Meta health (Sector A + Cloud)
- **goal:** Operational gate: live channels stable now + 7 days incident-free before S33/S34. Primary goal: reduce Meta block risk, not just Free.
- **depends_on:** []
- **status:** done
- **gates:** []
- **paths_hint:** `docs/s32-salud-anti-meta.md`, `docs/runbook-whatsapp-vm.md`, Settings WhatsApp, PM2 Sector A, Cloud dashboard/Usage
- **acceptance:**
  - [x] Immediate checklist Sector A: `connected`, circuit closed; smoke out `+5493469690201` sent/delivered 2026-09-25; inbound path OK.
  - [x] Immediate checklist Cloud: `connected` + traffic.
  - [x] Sector B / Treasury: documented `disconnected`/no QR = expected.
  - [x] 7d window Sector A OK; Cloud **waiver** 2026-09-25.
  - [x] **GO S33** 2026-09-25.
- **bps:**
  - [x] BP1 — Runbook/checklist S32 + evidence.
  - [x] BP2 — Cloud waiver + smoke Sector A + go/no-go.

### S33 — Log ingest Free (config + worker)
- **goal:** Reduce org Log Ingest to fit ~4 Baileys + Cloud under Free 1 GB/cycle. Config Collections/template + less REST from safety poll.
- **depends_on:** [S32]
- **status:** done
- **gates:** [optimizer]
- **paths_hint:** Supabase project `collections` + `whatsapp-ui-template`; `workers/whatsapp-baileys/`; `docs/s33-log-ingest.md`
- **acceptance:**
  - [x] `log_connections` not settable via SQL session → follow-up Dashboard documented (`docs/s33-log-ingest.md`).
  - [x] Worker: `worker_peek_pending` + poll default 120s; redeploy Sector A `safetyPollMs:120000` + Realtime SUBSCRIBED.
  - [x] Smoke Sector A post-redeploy: `S33 smoke peek…` → sent/delivered `3EB0485CDC11AA07BE5D81`.
  - [x] Baseline ~19k edge/24h documented; Log Ingest trend = follow-up ≥2–3h idle (doesn't block S34).
  - [x] Gate optimizer: free-tier risk = Log Ingest (not egress); mitigation peek+120s shipped.
- **bps:**
  - [x] BP1 — Audit log_connections; Dashboard follow-up documented.
  - [x] BP2 — peek + 120s; redeploy Sector A; smoke OK.
  - [x] BP3 — Measurement note + optimizer gate.

### S34 — Sector `turnos-demo` + SAMCO VM + QR
- **goal:** Sector `turnos-demo` operable in CRM; SAMCO VM + Baileys worker `SECTOR_SLUG=turnos-demo`; QR when number ready. **No** reminders yet.
- **depends_on:** [S33]
- **status:** done
- **gates:** [security]
- **paths_hint:** `supabase/migrations/20260925170000_sector_turnos_samco.sql`, `.cursor/orchestra.json` (`whatsappVmTurnosDemo`), runbook VM
- **acceptance:**
  - [x] Migration seed `turnos-demo` / `Turnos · Demo` / `baileys` + connection `disconnected` + membership admin.
  - [x] Orchestra stub `whatsappVmTurnosDemo` (`enabled=false`, host/sshKeyName null until ops).
  - [x] Host/sshKeyName VM `your-turnos-account@gmail.com` + deploy worker + PM2 (`whatsapp-ui-baileys-turnos-demo`; interim shutdown `guardia-samco-wa`).
  - [x] QR → `connected` (`5493469400082`); smoke CRM: `enqueue_sector_text` → outbox `sent` + message `delivered` `3EB076FD1351AA519402D9` (2026-09-25).
  - [x] Sector B / Treasury still no QR.
- **bps:**
  - [x] BP1 — Migration sector + connection + membership admin (applied remote).
  - [x] BP2 — Orchestra host/SSH + deploy VM (branch ship); Realtime SUBSCRIBED.
  - [x] BP3 — QR + smoke; security gate (pass: secrets VM-only chmod 600; 1 PM2; no service_role in client; residual contacts_upsert EPIPE doesn't block).


### S35 — Dual-DB reminders (guardia_samco integration)
- **goal:** Same worker detects appointment sign-up (stable format) and schedules/sends 24h/2h reminders via single session; appointment state in **guardia_samco**. Requires contract/plan approved in that repo.
- **depends_on:** [S34]
- **status:** pending
- **gates:** [security]
- **paths_hint:** `workers/whatsapp-baileys/` (outbound hook + guardia client); dual Supabase secrets; `workers/ejemplos_mensajes_turnos.txt`; mirror slices in guardia_samco
- **acceptance:**
  - [x] **guardia_samco** contract/plan aligned & approved (handoff 2026-09-25; cross-review OK — nits DRAFT labels + fix dual-DB env names in ship).
  - [ ] Parser tolerates canonical example variants (`Service` optional; variable spacing) — **ownership:** RPC/parser in guardia; worker only hook + body.
  - [ ] Outbound sign-up → row in guardia_samco + jobs 24h (if ≥24h) and 2h (if <2h → immediate).
  - [ ] Reminders sent via same session; reasonable pacing; no Vercel Cron; inbound `YES`/`NO` at 24h.
  - [ ] Single PM2; CRM whatsapp-ui-template intact.
  - [ ] Smoke with example message → test reminder (shorten window in staging/flag if needed).
- **bps:**
  - [x] BP0 — Block: you confirm architecture+plan guardia_samco approved for this integration.
  - [ ] BP1 — Wire dual-DB in worker (env names in orchestra; values gitignored); outbound hook → guardia RPC.
  - [ ] BP2 — Drain/send reminders from guardia_samco queue; YES/NO; smoke; security gate.
  - **order note:** don't ship BP1/BP2 until **guardia W1+W2** (schema+RPC); W0 can run in parallel.

## Notes for later (post-v2 / post-S17 / post-S18 / post-multi-sector)

- Importer via `.txt`/zip (`source=import`, dedupe).
- Cold storage Drive + job on VM.
- Stickers / location / vCard / reactions as product.
- Collections bot → outbox actor `system`.
- **Web Push** → **hermes-pwa-push** (VAPID, tables, cron, UI permission).
- Group admin (create/kick) if ever needed.
- **Optimizer** pass Storage (re-downloads media) if cached egress stays high after S18a/b.
- Sector-admin; Path B multi-project if org egress doesn't scale with 2 workers.
- QR Sector B / Treasury: only after Turnos ≥7 days green (anti-Meta).
- Collections D1–D4 (webhook R1 docs + S27 label → `kapso-demo` or waive) after K* wave.
