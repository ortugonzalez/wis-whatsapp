# API WIS v1

Base local: `http://localhost:3010/api/v1`. Todas las respuestas son `{data: ...}` o `{error: código}`. Tokens Bearer creados desde una sesión administradora; se muestran una sola vez y se almacenan como SHA-256. Cada token queda ligado al sector/conexión activo. Nunca poner tokens en workflows exportados.

## Contrato

| Método/ruta | Requisito | Resultado |
|---|---|---|
| GET connections | read | Estado sin QR ni credenciales |
| GET conversations, messages, operations | read | Últimos 50; `before` ISO y filtro `id`; messages admite conversation_id |
| GET contacts | read | Últimos 100 contactos |
| POST/PATCH contacts | contacts:write | Datos y evidencia de consentimiento; PATCH requiere id |
| POST media | send | Multipart file, 10 MiB máximo; devuelve media_bucket_path |
| POST messages | send + Idempotency-Key | `{to,type,body,media_bucket_path?}`; 202 es cola, no entrega |
| GET capabilities | read | Matriz documentada de soporte |
| GET/POST/DELETE tokens | sesión administrador | Crear `{name,scopes}`, revocar `?id=` |
| GET/POST/DELETE webhooks | webhooks:write | Crear `{url}` devuelve secret una vez, queda desactivado |

Scopes: `read`, `send`, `contacts:write`, `webhooks:write`. Las mutaciones con cookies requieren Origin idéntico al host del panel. Bearer no utiliza cookies. Todos los envíos requieren consentimiento registrado; las campañas están bloqueadas; bajas bloquean toda cola, incluida la UI heredada. Para registrar consentimiento se requieren fecha no futura, origen y alcance. La API no permite borrar una baja.

Tipos de envío: text, image, audio, document. Subir primero el archivo; sólo se aceptan paths del sector del token. No se descargan URLs arbitrarias. La clave de idempotencia se conserva por sector; repetir con otro contenido devuelve 409. Estados de operación: pending, sending, sent, failed, outcome_unknown. Entrega/lectura se consultan en `operations[].message.delivery_status` o en messages usando `message_id`; la operación conserva separado su estado de cola. Nunca reintentar outcome_unknown con otra clave sin reconciliar.

## Webhooks

Los triggers crean eventos `message.created`, `message.updated` y `operation.updated` sólo para destinos habilitados. El dispatcher se ejecuta explícitamente con `node --env-file=.env.local examples/webhook-dispatcher.mjs`. Requiere aprobación operativa, `WIS_WEBHOOKS_ENABLED=true`, habilitar el registro y configurar lista exacta `WIS_WEBHOOK_ALLOWED_HOSTS`. No hay scheduler activo. Sólo HTTPS/443 y IPv4 pública, DNS fijado durante la solicitud, sin redirects. Máximo cinco intentos, backoff y recuperación de claims vencidos. Hay entrega al menos una vez; deduplicar X-WIS-Event-ID.

Verificar HMAC SHA256 de `X-WIS-Timestamp + '.' + cuerpo original` contra X-WIS-Signature (`sha256=hex`) con comparación constante y tolerancia de cinco minutos. Guardar IDs procesados antes de acciones posteriores. Secretos de webhook se guardan en tabla exclusiva service_role: proteger disco y backups.

Los ejemplos n8n se importan desactivados. Configurar credencial Header Auth `Authorization: Bearer ...` y URL accesible desde n8n; localhost dentro de Docker apunta al contenedor. El ejemplo receptor no autoriza acciones: la verificación de firma debe preceder cualquier automatización real.

## Campañas de borrador

`GET/POST/PATCH /campaigns` sólo acepta sesión administrador. Crear con nombre, body, contact_ids, daily_limit explícito, window_start/window_end HH:mm (zona America/Argentina/Buenos_Aires). PATCH `{id,action:'preview'}` devuelve elegibles, excluidos y ausentes. `approve` valida consentimiento de todos y registra al administrador; `pause` pausa el borrador. Ninguna acción encola envíos: `execution_enabled` siempre false hasta una implementación y aprobación separada.

Especificación: `GET /api/v1/openapi`. Pruebas de DB: ejecutar `examples/api-database-test.sql` en la base local aislada, sin worker activo; toda escritura hace rollback. Pruebas del dispatcher: `node --test examples/webhook-dispatcher.test.mjs`.
