# Lectura de bloqueados

La pestaña WhatsApp Business → Lista de bloqueo consulta únicamente los registros guardados. El botón de consulta solicita una lectura remota explícita; no bloquea ni desbloquea contactos.

La API administrativa `/api/v1/blocklist` entrega fechas separadas para el último intento y la última respuesta exitosa. Si falla un refresco, conserva los identificadores anteriores y declara `available:false`, `stale:true` y un código de error sanitizado. Los identificadores retenidos no prueban el estado actual de bloqueo. Una fecha ausente se muestra como no registrada.

La prueba `test/qa/blocklist.test.mjs` verifica éxito seguido de fallo, conservación de registros, sanitización y acceso administrativo. Revisión independiente aprobada. Chrome mostró las dos fechas y la columna de antigüedad con la respuesta real ya almacenada. No se ejecutaron bloqueos, desbloqueos ni envíos. La sesión se conservó durante el reinicio local.
