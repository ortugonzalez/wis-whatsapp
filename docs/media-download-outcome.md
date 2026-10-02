# Resultado de descarga de medios

2026-10-02. Ruta 4: visibilidad de fallos de archivo sin repetir descargas.

El snapshot `message.media_download` conserva exclusivamente `status`, `observed_at` y, para un archivo guardado, `bytes`. Estados: `saved`, `interrupted`, `busy`, `too_large`, `failed`, `history_not_requested`. Se expone mediante el detalle autenticado de mensajes existente y se muestra en Información del mensaje. No conserva errores del proveedor ni supone vencimiento. Los registros anteriores permanecen sin resultado conocido. Un resultado guardado no garantiza disponibilidad actual del archivo.

Owner: suite 292/292; QA independiente: PASS, 2/2 focales. Prueba de ingestión con SQLite en memoria: descarga estancada, siguiente descarga bloqueada, texto persistido y recuperación posterior con bytes correctos. Prueba UI: estados permitidos, desconocidos y revocación. Sin mensajes externos, cambios de cuenta ni reintentos.

Producción antes del cambio: endpoint público informa connected, sin error actual; Chrome confirma despliegue anterior exitoso de 23:25:59 UTC. Esto no prueba recepción reciente.

Siguiente ruta: comprobar recepción pasiva real y resultados sanitizados nuevos cuando WhatsApp entregue medios, sin generar tráfico de prueba. Ampliar integración para tamaño excedido, escritura fallida e historial. La paridad WHAPI sigue incompleta.
