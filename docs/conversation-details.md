# Detalle local de conversaciones y contactos

`GET /api/v1/conversations?id=<UUID local>` identifica una conversación concreta. La respuesta distingue el registro local, el contacto vinculado explícitamente, los metadatos recibidos y el alcance del historial. Un ID inexistente debe devolver 404, no la lista completa.

Los recuentos describen mensajes persistidos en WIS, no todos los mensajes del teléfono. El historial puede ser parcial; una solicitud de historial aceptada no demuestra que sus mensajes hayan llegado.

El detalle de contacto puede mostrar conversaciones que coinciden exactamente con un identificador ya registrado aunque falte la relación interna de base de datos. Esa coincidencia no cambia el consentimiento, no fusiona contactos ni utiliza relaciones LID/PN contradictorias.

Abrir un detalle consulta SQLite y no marca mensajes como leídos. Python y el panel usan el mismo endpoint, con permiso `read`. Los identificadores y el contenido permanecen en las superficies autenticadas; los informes de validación sólo conservan conteos y resultados agregados.

Validación 2026-09-27: 40 pruebas locales, seis del cliente Python y build aprobados. Revisión independiente de API e interfaz sin hallazgos pendientes. Chrome comprobó el botón y las secciones del detalle real, sin errores ni consulta adicional de historial. Los fixtures verifican 400/404, recuentos por conversación, exclusión de campos secretos y ausencia de asociación inferida por LID.
