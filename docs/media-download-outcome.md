# Resultado de descarga de medios

2026-10-02. Ruta 4: visibilidad de fallos de archivo sin repetir descargas.

El snapshot `message.media_download` conserva exclusivamente `status`, `observed_at` y, para un archivo guardado, `bytes`. Estados: `saved`, `interrupted`, `busy`, `too_large`, `failed`, `history_not_requested`. Se expone mediante el detalle autenticado de mensajes existente y se muestra en Información del mensaje. No conserva errores del proveedor ni supone vencimiento. Los registros anteriores permanecen sin resultado conocido. Un resultado guardado no garantiza disponibilidad actual del archivo.

Owner: suite 292/292; QA independiente: PASS, 2/2 focales. Prueba de ingestión con SQLite en memoria: descarga estancada, siguiente descarga bloqueada, texto persistido y recuperación posterior con bytes correctos. Prueba UI: estados permitidos, desconocidos y revocación. Sin mensajes externos, cambios de cuenta ni reintentos.

Producción antes del cambio: endpoint público informa connected, sin error actual; Chrome confirma despliegue anterior exitoso de 23:25:59 UTC. Esto no prueba recepción reciente.

Publicado y confirmado por Chrome/EasyPanel: Success, 2026-10-02 23:44:20 UTC, título `feat: expose sanitized media download outcomes`. Cola y procesamiento estaban vacíos antes de publicar; después, el endpoint productivo sigue connected sin error actual. La captura de imagen falló por timeout tanto para el diálogo como para un recorte menor; se conserva evidencia textual del registro, sin inventar captura ni validar medios reales aún.

Siguiente ruta: comprobar recepción pasiva real y resultados sanitizados nuevos cuando WhatsApp entregue medios, sin generar tráfico de prueba. Ampliar integración para tamaño excedido, escritura fallida e historial. La paridad WHAPI sigue incompleta.

## Seguimiento 2026-10-02, ejecución de 23:51 UTC

Ruta 5: se añadió una prueba de integración aislada de SQLite y worker falso que verifica cuatro casos antes pendientes: tamaño superior a 25 MiB, fallo del proveedor con texto sensible ficticio, directorio temporal obstruido para simular fallo de escritura e historial que no inicia descargas. En todos se conserva el mensaje legible sin media_path; los snapshots contienen solo estado y fecha, sin el error ficticio. Owner: 1/1 PASS. No cambia el código productivo ni requiere otro despliegue.

Chrome mantiene el registro Success de 23:44:20 UTC. El filtro En cola muestra cero resultados y el endpoint productivo informa connected sin error actual. Son evidencias de estado, no recepción nueva. No se repitieron las capturas que agotaron el tiempo ni se reinició el worker.

QA independiente: PASS; ejecutó 1/1 pruebas y confirmó aislamiento, escenarios y sanitización sin tocar producción.

Próxima ruta: auditar de forma agregada la frescura de datos en el dashboard productivo y seleccionar una brecha de lectura WHAPI pendiente; no asumir que los fixtures locales prueban medios reales.
