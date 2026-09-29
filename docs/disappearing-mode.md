# Modo de mensajes que desaparecen

El panel permite solicitar, desde el detalle de una conversación conocida, una consulta de solo lectura a Baileys `fetchDisappearingDuration`. El worker consulta un único JID existente, exige una respuesta correlacionada exactamente con ese JID y persiste únicamente duración en segundos, fecha de configuración cuando viene informada y hora de observación. No consulta listas arbitrarias ni ejecuta envíos.

La ruta `POST /api/v1/sync` acepta `{"kind":"disappearing_mode","target":"<JID de conversación conocida>"}`. Requiere sesión administradora; solicitudes repetidas mientras una lectura está activa se deduplican. `GET /api/v1/conversations?id=...` devuelve la observación dentro de `snapshots`; `GET /api/v1/disappearing-mode?target=...` expone su estado y el de la última solicitud.

Esto es una variable propia observada por JID. No se marca como equivalencia WHAPI: `patchchat.ephemeral` es un parámetro de escritura y no basta para probar unidades o que el valor observado sea la configuración efectiva de una conversación. No se ejecuta un barrido automático. Una vez que el worker local esté conectado, un administrador puede consultar cada conversación desde el panel.

La prueba automatizada valida respuestas exactas, JID no coincidente, valores inválidos, deduplicación de la cola, permisos, exposición solo de campos aprobados y que no se envían mensajes. La conexión local permanece necesaria para obtener valores reales de WhatsApp.
