# API WIS v1 · SQLite

Base local: `http://127.0.0.1:3010/api/v1`. El contrato vigente es [OpenAPI](api.openapi.json), servido también en `/api/v1/openapi`. El runtime administra una cuenta vinculada y un administrador; no implementa todavía sectores ni múltiples conexiones.

Las respuestas usan `{data: ...}` o `{error: código}`. Las listas paginadas incluyen `meta` con `total`, `limit`, `offset` y `has_more`. Tokens Bearer revocables: se muestran una vez y se guardan como hash. No incluirlos en workflows exportados. Los permisos disponibles son `read`, `send`, `contacts:write` y `webhooks:write`; ciertos recursos además requieren sesión administrativa de navegador.

## Recursos principales

| Recurso | Uso |
|---|---|
| `connections` | Estado sin credenciales; el QR usa una ruta administrativa separada |
| `conversations`, `contacts`, `messages` | Listas paginadas, búsqueda y detalles locales |
| `messages?id=UUID` | Contenido, contexto, cita, reacciones y recibos observados |
| `history?conversation_id=UUID` | Estado de solicitudes de historial, sin garantía de completitud |
| `sync` | Solicitudes administrativas de lectura acotadas por el worker |
| `operations?id=UUID` | Estado de la operación saliente |
| `media` | Inventario local; `?path=` entrega bytes autenticados |
| `account`, `groups`, `snapshots`, `events` | Datos recibidos y actividad local con controles de acceso |
| `products`, `collections`, `labels`, `communities`, `channels` | Exploradores con disponibilidad y alcance explícitos |
| `capabilities`, `reference-fields` | Cobertura WIS y campos de referencia WHAPI, diferenciados |
| `webhooks`, `webhook-deliveries`, `webhook-events` | Configuración desactivada, trazabilidad y contrato de eventos |

## Envíos y archivos

`POST /media` recibe JSON `{mime_type,base64}`, valida tipo y firma del archivo y devuelve `media_path`. Límite: 10 MiB. No descarga URLs arbitrarias. `POST /messages` recibe `{to,type,body,media_path?}` y requiere `Idempotency-Key`, permiso de envío, consentimiento válido, ausencia de baja y activación operativa autorizada. Los tipos disponibles son texto, imagen, audio y documento.

La aceptación 202 indica ingreso a cola, no entrega. Una misma clave con contenido distinto devuelve conflicto. Los estados registrados incluyen `pending`, `sending`, `sent`, `delivered`, `read`, `failed` y `outcome_unknown`. Un resultado desconocido requiere reconciliación antes de intentar un nuevo envío con otra clave. Los envíos reales permanecen desactivados en la instalación entregada.

## Webhooks

El dispatcher pertenece al worker supervisado; no se ejecuta por separado. Conserva eventos firmados, reintentos limitados y estados de entrega en SQLite. Continúa desactivado hasta aprobar destino, datos e impacto concretos. El [manual de webhooks](webhooks-local.md) detalla el contrato, las restricciones de destino, la firma y los ejemplos Python/n8n.

## Campañas

Las acciones administrativas permiten borrador, previsualización, aprobación del borrador y pausa. No ejecutan campañas ni encolan sus envíos. Registrar aprobación de un borrador no habilita el motor comercial. Se verifica consentimiento y baja también al solicitar envíos por API.

## Ejemplos y verificación

`examples/python_client.py` consume la misma API que el panel; `iter_records` recorre páginas. La base recibe eventos nuevos durante una exportación: deduplicar por ID y reconciliar cambios. Los workflows n8n se importan desactivados. Si n8n corre en otra máquina o contenedor, su `localhost` no apunta a esta instalación; el acceso remoto autenticado y HTTPS se preparará antes de desplegar.

Pruebas vigentes: `npm run test:local`, `npm run test:api` y pruebas Python en `examples`. El SQL histórico basado en PostgreSQL no es una migración ni una prueba del runtime SQLite.
