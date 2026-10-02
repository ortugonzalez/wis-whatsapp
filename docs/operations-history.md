# Historial de operaciones

La sección Operaciones permite consultar todos los registros retenidos, con paginación y filtro por estado exacto. Incluye fechas de creación/actualización, destino, tipo y detalle de identificadores y estado del mensaje asociado. No equivale al historial completo de WhatsApp: solamente contiene operaciones registradas por WIS. El detalle es una instantánea explícita; la lista se actualiza por polling.

GET /api/v1/operations conserva sus parámetros id, limit y offset, y añade status con uno de pending, sending, sent, delivered, read, failed u outcome_unknown. Filtros combinados se aplican conjuntamente. Valores inválidos devuelven 400; sigue exigiendo autenticación y permiso read. La respuesta mantiene data y metadatos total/limit/offset/has_more.

La pantalla no tiene acciones de reintento, conciliación ni envío. Los resultados inciertos muestran la necesidad de conciliar antes de reintentar. Una incidencia se indica sin exponer el texto bruto de errores. No se cambia ningún flag ni se envían mensajes durante la validación. La prueba API usa SQLite en memoria y verifica que registros y cantidad de mensajes permanezcan sin cambios.
