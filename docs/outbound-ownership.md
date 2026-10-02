# Respuestas tardías de envío

2026-10-02. Ruta: robustez del worker y QA independiente.

El worker conserva el socket que inició cada envío y verifica su propiedad antes de guardar una respuesta. Al detenerse registra el envío activo como `outcome_unknown`, sin reintento automático. Las respuestas y rechazos posteriores a `stop()` no acceden a SQLite; un resultado terminal reconciliado no se sobrescribe desde el manejador de errores.

Validación: `npm test`, 280/280; QA independiente de `qa_ops`, PASS. Prueba específica con socket simulado, base en memoria y directorios temporales: respuesta tardía, operación reconciliada, éxito y rechazo después de cerrar SQLite. Sin mensajes reales ni cambios de configuración productiva.

Antes de integrar: endpoint público informa conexión activa; Chrome muestra cero operaciones en cola y cero procesándose. Esto no prueba recepción reciente.

Producción: EasyPanel confirma Success el 2026-10-02 a las 21:24:35 UTC para `fix: fence late outbound results after worker shutdown`. Después, el endpoint sigue conectado y sin error actual; Chrome vuelve a mostrar el historial con 14 operaciones y cero procesándose. No se enviaron mensajes de prueba. La prueba del comportamiento de apagado sigue siendo sintética: no se provocó un envío real pendiente para interrumpirlo.

Límites: no demuestra entrega real ni paridad WHAPI. Próxima ruta: frescura y brechas de datos productivos, con conteos agregados y sin repetir consultas de proveedor agotadas.

Seguimiento 2026-10-02, 22:21 UTC: nueva regresión de reemplazo del socket sin detener el worker. Usa exclusivamente SQLite en memoria, sockets simulados y directorios temporales. Una respuesta tardía del socket anterior queda como resultado desconocido, sin ID de envío aceptado ni una segunda operación; la conexión simulada nueva sigue activa. Prueba focal 2/2 aprobada. Esta comprobación no fuerza ninguna reconexión productiva y no prueba comportamiento de entrega del proveedor.

Chrome recargado en este seguimiento: indicadores de recepción todavía sin fecha desde su instrumentación; no se infiere ausencia de mensajes ni recepción reciente del estado conectado. Próxima ruta: extender evidencia de funciones y campos disponibles, manteniendo explícitas estas limitaciones. No se requiere despliegue por esta ampliación de pruebas.
