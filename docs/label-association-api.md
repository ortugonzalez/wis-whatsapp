# API de asociaciones por tipo

2026-10-03, ejecución 02:22 UTC. Ruta 4: exposición de datos ya persistidos, sin consultas nuevas a WhatsApp.

GET `/api/v1/label-associations?type=message` devuelve referencias de asociaciones activas de mensajes observadas. `type=chat` sigue siendo el valor predeterminado y conserva el contrato anterior. Valores diferentes devuelven HTTP 400. Requiere la autenticación y permiso de lectura existentes; no envía mensajes ni modifica etiquetas.

La búsqueda y paginación operan dentro del tipo seleccionado. `meta.observed` y `last_updated_at` corresponden al tipo, incluidas las observaciones de bajas: una baja es evidencia recibida aunque no queden asociaciones activas. No se rejuvenece el estado de mensajes por eventos de etiquetas del chat. Sin registros de ese tipo, el estado es `not_collected`; con registros, siempre `observed_partial`. `history_complete` permanece falso. Las referencias no equivalen a mensajes completos WHAPI ni a inventario remoto completo.

Producción continúa conectada sin error actual según el endpoint de estado; no se interpreta como recepción reciente. Chrome muestra Etiquetas sin filas y con aviso de información no recopilada. EasyPanel conserva la implementación anterior de corrección de fechas. Esta ampliación todavía es local y no cambia la cobertura observada productiva.

Validación: owner focal 9/9 PASS, suite completa 299/299 PASS y diff sin errores de formato. QA independiente 9/9 PASS; filtro cerrado y parametrizado, metadatos por tipo revisados. La UI sigue pendiente.

Próxima ruta: selector Chat/Mensajes en el explorador con estado de carga protegido ante respuestas fuera de orden, descripción explícita de referencias y metadatos de frescura. Integrar el paquete revisado y comprobarlo en producción sin ampliar permisos ni activar envíos. Paridad WHAPI y recuperación productiva completa siguen pendientes.
