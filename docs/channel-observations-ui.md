# Observaciones de canales

El detalle del canal incorpora vistas y reacciones recibidas pasivamente, con selección por tipo, páginas de 25 y actualización de la base local. No solicita lecturas a WhatsApp, no suscribe canales y no envía reacciones. Cada fila corresponde a la última notificación conservada de ese tipo para un mensaje; no representa un historial completo ni prueba que el dato siga vigente.

La API existente `GET /api/v1/snapshots` admite `channel_id` exacto únicamente con `newsletter_view` y `newsletter_reaction`. Conserva autenticación y permiso de lectura, filtro opcional por recurso y paginación. Devuelve `complete:false` y `scope:latest_notification_per_message`. Un filtro de canal inválido o aplicado a otro tipo devuelve 400.

La cantidad informada en una notificación de reacción no es un total de reacciones. Cero, falso y desconocido se muestran por separado; no se infieren totales ni equivalencias WHAPI adicionales. La ausencia de filas no demuestra ausencia de vistas o reacciones en WhatsApp.

Validación local: 276 pruebas de suite pasaron antes del ajuste de concurrencia de interfaz; las 3 pruebas focales posteriores pasaron, incluida la regresión abrir A, abrir B y resolver A tarde. QA independiente aprobó la corrección. Chrome verificó 27 vistas sintéticas en dos páginas y una reacción, preservando cero y falso. La base sintética se mantuvo en memoria y su servidor se detuvo.

EasyPanel confirmó despliegue exitoso el 2 de octubre de 2026 a las 15:05:59 UTC. Producción conservó conexión Baileys e identidad verificada. La página Canales informó cero registros observados; por tanto, la tarjeta con datos se verificó con fixtures, no con notificaciones reales de esta cuenta. No se solicitaron nuevas suscripciones ni se enviaron mensajes durante esta entrega.

Siguiente frente observado: la vista general contiene un badge fijo de envíos pausados que puede contradecir el estado dinámico de la conexión. Corregir esa presentación para que use el estado real sin modificar flags ni ejecutar envíos.
