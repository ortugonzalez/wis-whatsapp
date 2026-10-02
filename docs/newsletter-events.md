# Notificaciones pasivas de canales

El worker conserva `newsletter.view` y `newsletter.reaction` emitidos por Baileys, sin suscribirse a canales ni hacer consultas adicionales. Aparecen en **Más herramientas → Actividad**; filtrar por el nombre exacto del evento. La tabla se actualiza automáticamente. El registro de actividad mantiene el límite global existente de 1.000 eventos.

La API autenticada permite consultar `/api/v1/snapshots?kind=newsletter_view` y `kind=newsletter_reaction`, con paginación existente. El snapshot por canal y mensaje conserva la última notificación recibida. Incluye `observed_at`, `source=baileys_passive_event` y `scope=latest_notification_only`; no contiene el cuerpo del mensaje ni campos arbitrarios del proveedor.

`reported_view_count` es el número reportado por el evento, sin calcular máximos ni acumulados. Para reacciones, `reported_event_count` NO es el total de reacciones: la versión instalada de Baileys genera `count=1` al procesar una notificación. Se conservan código, count y removed cuando vienen válidos, y null cuando la última notificación no contiene ese dato. No se suman eventos duplicados. No existe un identificador único que permita deduplicar con certeza la actividad recibida; los snapshots reemplazan el último dato de la misma clave.

Evidencia técnica: `node_modules/baileys/lib/Types/Events.d.ts` y `lib/Socket/messages-recv.js`, handler `handleNewsletterNotification`. La referencia [WHAPI getmessagesnewsletter](https://whapi.readme.io/reference/getmessagesnewsletter), consultada el 2026-10-02, describe historial con paginación. Estas notificaciones no equivalen a dicho historial ni acreditan cobertura total. No se añade una equivalencia WHAPI hasta verificar su contrato por campo.

La ausencia de notificaciones no significa cero visualizaciones o reacciones. No se fabrican registros para mostrar actividad. Las pruebas usan eventos ficticios; observar datos de una cuenta real requiere que WhatsApp efectivamente emita el evento.
