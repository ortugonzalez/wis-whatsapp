# Diagnóstico pasivo de lotes recibidos

2026-10-03, ejecución 03:22 UTC. Ruta 1/4, sin reintentar consultas remotas agotadas.

Producción en Chrome: conexión verificada, lease vigente, recolector dentro del intervalo y última escritura de snapshot a las 00:19 de Buenos Aires. No hay fecha de notificación entrante ni de lote entrante añadido. El último evento figura a las 00:12; el mensaje entrante almacenado conserva fecha 2 de octubre 12:06. EasyPanel conserva el despliegue del selector. La evidencia no distingue inactividad real, eventos sin contenido o ecos salientes; no se atribuye causa sin datos.

Se agrega localmente un observador pasivo de `messages.upsert`. Guarda únicamente el último lote en `message_activity/last_upsert`: hora de observación, tipo allowlist (notify/append/other), cantidad de sobres y conteos de dirección entrante, saliente, desconocida y sobres sin contenido. Estos últimos pueden superponerse con las categorías de dirección. No registra identificadores, tipos arbitrarios ni contenido personal. Se sujeta a la misma guarda de propiedad del worker.

La nueva observación no confirma guardado, mensajes únicos, entrega ni historial completo. No convierte ecos o mensajes sin contenido en recepción entrante verificada, ni cambia las marcas de recepción existentes. La ausencia del snapshot después del despliegue significará que aún no se observó un lote, no que WhatsApp no tenga mensajes. Es diagnóstico del último lote, no contador acumulado.

Pruebas focales iniciales 2/2 PASS: privacidad, eco, contenido ausente, dirección desconocida, ausencia de efecto para historial y guarda de propiedad. Pendiente exponer estos agregados con fecha en API/dashboard antes del siguiente despliegue; el inventario de campos por sí solo no permite ver sus conteos. No se reinició producción ni se provocó un envío de prueba.

Validación final: suite completa 301/301 PASS, QA independiente 2/2 PASS sin hallazgos y diff sin errores. El diagnóstico continúa local, pendiente de despliegue.

Próxima ruta: endpoint/resumen del último lote con sanitización y fecha explícita, UI que distinga actividad de socket y recepción entrante, luego paquete revisado. No declarar resuelta la falta de evidencia reciente ni paridad WHAPI.
