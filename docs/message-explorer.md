# Mensajes, archivos e historial

El buscador global consulta el texto de los mensajes almacenados en SQLite, con paginación. No inicia búsquedas remotas ni descarga historial automáticamente. Cada mensaje tiene un detalle de contenido, estado, origen, cita, menciones, reacciones, confirmaciones y metadatos disponibles. Los campos ausentes se identifican como no registrados.

Las ediciones y revocaciones recibidas actualizan el registro local; no eliminan su trazabilidad. Las reacciones y confirmaciones por participante se conservan cuando llegan eventos compatibles. Los datos antiguos no adquieren retroactivamente campos que nunca se almacenaron.

La biblioteca multimedia enumera únicamente archivos registrados por mensajes o cargas locales. El acceso a los bytes requiere autenticación y verificación de pertenencia al almacenamiento privado. Un archivo histórico no descargado no se presenta como disponible.

## Solicitudes de historial

Un administrador puede solicitar hasta 50 mensajes anteriores de una conversación conocida. El worker utiliza la clave y fecha del mensaje más antiguo persistido como referencia. Baileys envía una solicitud de sincronización al dispositivo vinculado; no envía un mensaje al destinatario ni una confirmación de lectura.

El panel diferencia cola, procesamiento, solicitud aceptada, llegada correlacionada y resultado desconocido. Solo un identificador explícito de correlación de WhatsApp vincula una llegada con una solicitud. El contador de llegada representa eventos recibidos y no necesariamente mensajes nuevos añadidos a SQLite. La sincronización general de la cuenta no demuestra llegada de historial de un chat particular. Ninguno de estos estados garantiza recuperar el historial completo.

Las pruebas automatizadas usan transportes simulados y bases temporales. La validación en Chrome comprueba navegación, búsqueda y detalle sobre datos ya persistidos. No se solicita historial remoto como parte de esas pruebas.

## Recursos HTTP

- `GET /api/v1/messages?q=texto&offset=0&limit=50`: búsqueda paginada.
- `GET /api/v1/messages?id=UUID`: detalle, conversación, contacto y metadatos.
- `GET /api/v1/history?conversation_id=UUID`: solicitud y sincronización observadas.
- `POST /api/v1/sync` con `{"kind":"history","target":"JID conocido"}`: solicitud acotada, solo administrador.
- `GET /api/v1/media`: inventario paginado de archivos registrados.
- `GET /api/v1/media?path=archivo`: bytes autenticados.

El contrato detallado se conserva en `docs/api.openapi.json`. Los clientes deben deduplicar mensajes por identificador durante la paginación de una base que recibe eventos nuevos.
