# Bots disponibles según WhatsApp

La tarjeta en Mi cuenta muestra el listado que WhatsApp entregue mediante la consulta `bot` versión 2. Es un inventario del proveedor, no una pantalla de configuración de automatizaciones WIS. No crea contactos, no inicia conversaciones y no envía mensajes.

La lectura manual requiere sesión administrativa y se encola como `bot_list`. El worker usa exclusivamente un IQ de tipo `get`, valida el contenedor y conserva solo identificadores permitidos. Una respuesta ausente o inválida se distingue de una lista vacía válida. La lista se limita a 1000 registros; cualquier truncamiento se informa. Tras un fallo se conserva el resultado anterior con su antigüedad.

`GET /api/v1/bots` consulta la copia local con permisos de lectura, búsqueda y paginación. Python puede usar `iter_records('bots')`; n8n puede consultar el mismo endpoint mediante HTTP Request. Ninguna de esas lecturas inicia una actualización remota.

Referencia revisada el 2026-09-27: https://whapi.readme.io/reference/getbotlist . WHAPI describe bots disponibles para la cuenta. La implementación de Baileys instalada entrega identificador y persona; no se presume equivalencia de todos los campos ni disponibilidad universal.

Prueba real del 2026-09-27: una consulta manual desde Chrome terminó en `provider_error`, estado 500. La tarjeta mostró información no disponible y fecha del intento; no se interpretó como catálogo vacío. No se repitió la solicitud. La búsqueda alternativa en registros locales no encontró contactos ni conversaciones con dominio `@bot`; esto tampoco demuestra ausencia de bots, porque no todos sus identificadores usan ese dominio. No se infirieron cuentas de bots a partir de números.

Pruebas del lector y API aprobadas, con revisión independiente. La cobertura permanece parcial por indisponibilidad de la respuesta real del proveedor.

Seguimiento programado de producción, 2026-09-30 18:30 UTC: el turno `bot_list` se encoló a las 18:29:14 UTC y terminó con `provider_error`; no se aceptó una lista vacía como respuesta verificada. La sesión siguió conectada/verificada, el worker conservó su lease y los envíos permanecieron pausados. La vista de capacidades no registró rutas nuevas; la próxima lectura es `disappearing_mode` a las 18:44 UTC. El resultado no demuestra que la cuenta carezca de bots.
