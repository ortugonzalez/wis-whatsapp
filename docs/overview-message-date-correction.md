# Fecha del mensaje y evidencia de recepción

2026-10-03, ejecución 00:36 UTC. Ruta 1 seguida por corrección de presentación, sin reiniciar para diagnóstico.

Chrome mostró la tarjeta de observabilidad con worker Activo, 14 entrantes en vivo y Última recepción observada a las 12:06 de Argentina, mientras los nuevos indicadores de notificación y lote entrante estaban vacíos. El código confirma que `coverage.last_live_message_at` es MAX(messages.created_at) para origen live, no fecha de recepción. Había una contradicción de significado entre las tarjetas.

Se cambia la etiqueta a Fecha del último entrante · origen live y el contador a Entrantes almacenados · origen live. El texto explica que la fecha proviene del mensaje y puede acompañar sincronización o repeticiones. Worker muestra Lease vigente, Sin lease vigente o Lease no informado según booleano estricto. La propiedad temporal no confirma recepción.

Evidencia agregada previa: 29 tipos de snapshots, 436 campos listados, 78 lecturas fallidas registradas; la última escritura era 21:34 de Argentina, sin inferir actualización de todos los campos. El recolector estaba dentro del intervalo, próxima ruta Temporizador de mensajes. No se forzó ninguna lectura. Último deploy visible 23:44:20 UTC.

Prueba focal de render: 10/10 PASS, incluidos lease ausente/falso/verdadero y mensaje con fecha/ausente. Próxima ruta: verificar las etiquetas productivas y el paquete de alias del perfil propio previamente revisado, manteniendo pendientes recepción real y paridad completa.

Suite completa 295/295 PASS. QA independiente PASS con ejecución focal 10/10; no modificó archivos ni producción. El paquete incorpora además el mapeo de nombres propios auditado en health-field-mapping.md y las pruebas de fallos de medios, sin modificar envíos ni políticas de la cuenta.
