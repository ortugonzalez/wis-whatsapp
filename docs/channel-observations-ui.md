# Observaciones de canales

El detalle del canal incorpora vistas y reacciones recibidas pasivamente, con selección por tipo, páginas de 25 y actualización de la base local. No solicita lecturas a WhatsApp, no suscribe canales y no envía reacciones. Cada fila corresponde a la última notificación conservada de ese tipo para un mensaje; no representa un historial completo ni prueba que el dato siga vigente.

La API existente `GET /api/v1/snapshots` admite `channel_id` exacto únicamente con `newsletter_view` y `newsletter_reaction`. Conserva autenticación y permiso de lectura, filtro opcional por recurso y paginación. Devuelve `complete:false` y `scope:latest_notification_per_message`. Un filtro de canal inválido o aplicado a otro tipo devuelve 400.

La cantidad informada en una notificación de reacción no es un total de reacciones. Cero, falso y desconocido se muestran por separado; no se infieren totales ni equivalencias WHAPI adicionales. La ausencia de filas no demuestra ausencia de vistas o reacciones en WhatsApp.

Validación local: 276 pruebas de suite pasaron antes del ajuste de concurrencia de interfaz; las 3 pruebas focales posteriores pasaron, incluida la regresión abrir A, abrir B y resolver A tarde. QA independiente aprobó la corrección. No se registran datos personales ni se modifica la sesión. La validación visual y el despliegue quedan pendientes hasta comprobarlos explícitamente en Chrome/EasyPanel.
