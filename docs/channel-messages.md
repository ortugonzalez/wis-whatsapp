# Mensajes de canales conocidos

El detalle de un canal permite consultar los mensajes guardados y solicitar manualmente una lectura administrativa. La consulta usa el IQ `get` de `newsletterFetchMessages` de Baileys instalado, con un máximo de 50 registros y tiempo limitado. No se suscribe al canal, no envía recibos ni descarga archivos.

`GET /api/v1/channel-messages?target=JID` acepta únicamente un canal ya presente en conversaciones o snapshots. Admite filtros y paginación del conjunto local; no representa paginación remota del historial completo. Devuelve texto y metadatos permitidos, excluyendo claves y URLs multimedia. `POST /api/v1/sync` con `kind:newsletter_messages` requiere sesión administrativa. Python puede leer mediante `channel_messages(target)`; n8n puede usar HTTP Request con el mismo GET y un token de lectura.

El formato de respuesta binaria se valida antes de persistir: una respuesta ausente o desconocida falla explícitamente. Los datos previos se conservan como antiguos si falla una actualización. La cobertura permanece parcial aun cuando se reciban menos de 50 mensajes.

Referencia: https://whapi.readme.io/reference/getmessagesnewsletter (consultada el 2026-09-27). WHAPI ofrece su propio contrato de historial con parámetros before/after; esta implementación no lo reproduce completamente.

Validación local con fixtures: solicitud de lectura sin mutaciones, límite y exclusión de secretos; permisos API, canal desconocido, deduplicación de solicitudes y conservación tras fallo. Esta sesión no tiene canales conocidos al implementar la función: no se ejecutó una consulta remota ni se acredita compatibilidad del contenedor con una respuesta real del proveedor. Será necesario validarla cuando la sesión reciba un canal.

Resultados: 41 pruebas locales, 18 de QA y 7 del cliente Python aprobadas. La revisión independiente detectó y corrigió el rechazo de errores incluidos junto a un contenedor de mensajes; la regresión específica también pasó después de la corrección. La comprobación sintáctica del panel y worker pasó.
