# S32 — Salud anti-Meta (checklist + evidencia)

Gate antes de S33 (log ingest) y S34 (Turnos SAMCO). Objetivo: bajar riesgo de bloqueo/restricción Meta, no solo Free de Supabase.

## Alcance

| Sector | Esperado en S32 |
| --- | --- |
| Contable (Baileys) | Vivo — checklist + 7 días |
| `kapso-8257` (Kapso) | Vivo — checklist + 7 días **o waiver** |
| `eq-tecnico-centros` | Sin QR / `disconnected` = OK |
| `tesoreria` | Sin QR / `disconnected` (puede mostrar `logged_out`) = OK |

## Incidentes que rompen la ventana de 7 días

- Logout forzado / `logged_out` / sesión invalidada
- Circuit abierto por rate-limit / 429
- Ban / restrict / conflict / 403 de sesión en logs worker
- Reconnect loop (≥3 caídas–reconexiones en 1 h sin acción admin)
- Kapso: quality en rojo / messaging limit caído / status ≠ `connected`

**No cuentan:** restart/deploy humano, QR admin a propósito, error aislado recuperado.

## Checklist inmediato

### Contable (Baileys)

- [x] `whatsapp_connections.status = connected`
- [x] `circuit_open_until` null; `last_error` null
- [x] PM2 `whatsapp-ui-baileys` **online**
- [x] Smoke outbound `+5493469690201`: enqueue `S32 smoke Contable…` → outbox `sent`, `delivery_status=delivered`, `wa_message_id=3EB0F7FDF6DDE9F71AD562` (2026-09-25)
- [x] Inbound path: mensajes `in` recientes en el mismo hilo (`probando sonido` 2026-09-21) + `inbound_saved` en PM2 hoy

### Kapso (`kapso-8257`)

- [x] `status = connected`; tráfico reciente
- [x] **Waiver ventana 7 días** (Percy 2026-09-25): sector vivo desde ~21 Sep (~4 d); se acepta y se sigue a S33

### No-vivos (documentar, no “arreglar”)

- [x] eq-técnico: `disconnected`, sin teléfono
- [x] Tesorería: `disconnected` / `logged_out` histórico OK hasta QR

## Evidencia snapshot (2026-09-25)

| Sector | status | Notas |
| --- | --- | --- |
| contable | connected | PM2 online; smoke out OK; ~7 d tráfico |
| kapso-8257 | connected | Waiver 7d |
| eq-tecnico-centros | disconnected | Esperado |
| tesoreria | disconnected | Esperado |

**Nota ops:** en error.log aparecen `MessageCounterError` / `Bad Gateway` intermitentes — no bloquean S32 (sesión connected + send OK); vigilar si empeoran.

## Go / no-go

- [x] **GO S33** — Percy 2026-09-25 (waiver Kapso 7d + smoke Contable OK)
