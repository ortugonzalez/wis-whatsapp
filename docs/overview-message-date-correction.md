# Fecha del mensaje y evidencia de recepción

2026-10-03, ejecución 00:36 UTC. Ruta 1 seguida por corrección de presentación, sin reiniciar para diagnóstico.

Chrome mostró la tarjeta de observabilidad con worker Activo, 14 entrantes en vivo y Última recepción observada a las 12:06 de Argentina, mientras los nuevos indicadores de notificación y lote entrante estaban vacíos. El código confirma que `coverage.last_live_message_at` es MAX(messages.created_at) para origen live, no fecha de recepción. Había una contradicción de significado entre las tarjetas.

Se cambia la etiqueta a Fecha del último entrante · origen live y el contador a Entrantes almacenados · origen live. El texto explica que la fecha proviene del mensaje y puede acompañar sincronización o repeticiones. Worker muestra Lease vigente, Sin lease vigente o Lease no informado según booleano estricto. La propiedad temporal no confirma recepción.

Evidencia agregada previa: 29 tipos de snapshots, 436 campos listados, 78 lecturas fallidas registradas; la última escritura era 21:34 de Argentina, sin inferir actualización de todos los campos. El recolector estaba dentro del intervalo, próxima ruta Temporizador de mensajes. No se forzó ninguna lectura. Último deploy visible 23:44:20 UTC.

Prueba focal de render: 10/10 PASS, incluidos lease ausente/falso/verdadero y mensaje con fecha/ausente. Próxima ruta: verificar las etiquetas productivas y el paquete de alias del perfil propio previamente revisado, manteniendo pendientes recepción real y paridad completa.

Suite completa 295/295 PASS. QA independiente PASS con ejecución focal 10/10; no modificó archivos ni producción. El paquete incorpora además el mapeo de nombres propios auditado en health-field-mapping.md y las pruebas de fallos de medios, sin modificar envíos ni políticas de la cuenta.

Publicado: EasyPanel Success 2026-10-03 00:39:51 UTC. Había cero operaciones procesando y en cola antes de publicar. Durante el cambio de contenedor la ruta mostró Not Found transitorio; al recargar después del arranque volvió el dashboard sin intervención ni segundo despliegue. Endpoint final connected sin error. Se abrió Diagnóstico y cobertura de datos y se confirmaron visualmente las etiquetas corregidas y Lease vigente. La captura de imagen del nuevo contenido volvió a agotar el tiempo; no se reiteró ni se guardó una captura ficticia.

Matriz productiva posterior: 189 rutas observadas (14 exactas, 175 equivalencias), 44439 sin observar; 24/177 funciones con alguna ruta observada y 4 con todas sus rutas documentadas observadas. Solo una de las dos nuevas equivalencias tiene evidencia productiva; no se infiere la segunda a partir de fixtures. Sin marca obsoleta no equivale a vigencia. Próxima ruta: reducir confusión o impacto de la ventana transitoria del arranque mediante auditoría de healthcheck/ruteo y estrategia de actualización, sin duplicar propietarios de sesión ni cambiar configuración de producción sin revisión.
