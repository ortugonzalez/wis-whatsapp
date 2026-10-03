# Auditoría del catálogo de bots

2026-10-03, ejecución 01:37 UTC. Ruta 2 después del ensayo aislado de restauración. Worktree limpio al comenzar. Chrome confirma última publicación de las etiquetas de fecha de mensajes (00:39:51 UTC); no hubo nuevo despliegue.

Referencia pública consultada: [Get bots](https://whapi.readme.io/reference/getbotlist), que describe la lista de bots disponibles para la cuenta. La variante Markdown no fue accesible con el lector web; se usó la página HTML como alternativa. El inventario local 1.8.7 conserva cuatro rutas de respuesta: `bots`, `bots[].id`, `bots[].persona_id`, `count`. La página legible no aclaró la representación exacta de `id`, por lo que no se añadió una equivalencia con JID por similitud.

Producción, exclusivamente metadatos de la tarjeta ya guardada: Información no disponible, error del proveedor 500, último intento 2 de octubre 21:26 hora de Argentina, sin respuesta exitosa registrada, cero registros locales. No se consultaron identificadores ni se pulsó Consultar en WhatsApp. Un 500 no demuestra que no haya bots ni que la capacidad nunca esté soportada.

El lector existente valida la respuesta IQ v2, conserva como máximo 1000 entradas, distingue respuesta vacía de ausencia de sección y conserva persona_id ausente como null. La API/panel mantiene el alcance parcial y muestra errores sanitizados. No se repitió el intento fallido ni se fabricaron bots WIS como sustituto del catálogo de WhatsApp.

Resultado añadido: regresión con el esquema real que impide contar un error como cobertura y excluye campos homónimos de contactos. Una observación sintética anterior de bots/persona marcada obsoleta aporta solo dos rutas obsoletas, nunca salud actual, ID equivalente o total del catálogo. Owner: 2/2 pruebas focales aprobadas incluyendo el lector del protocolo; no cambió código de producción.

Próxima ruta: dejar este método en brecha sin nuevos intentos manuales y auditar un recurso distinto que ya tenga evidencia pasiva (etiquetas o asociaciones de chat). Si se vuelve al catálogo, exigir evidencia nueva de protocolo/respuesta antes de afirmar correspondencia ID o éxito. Paridad WHAPI sigue incompleta.

QA independiente: PASS, 2/2 focales. El inventario de evidencia del test es sintético: no reproduce un HTTP 500 real ni valida producción. No se repitió la suite global porque solo se agregó una prueba y documentación. Sin cambios en permisos, cuentas, banderas o sesión.
