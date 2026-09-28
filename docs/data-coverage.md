# Cobertura de datos observados

Las fallas de lecturas se muestran agrupadas por recurso y código sanitizado. Solo se exponen códigos internos permitidos; cualquier valor desconocido se convierte en `read_failed` antes de agrupar. Se muestran hasta 100 grupos; `read_errors_truncated` avisa si quedan más. No se publican destinos, IDs ni mensajes de error originales.

`GET /api/v1/coverage` devuelve conteos de contactos, conversaciones, grupos, mensajes y observaciones de identidad LID/PN. El resumen de identidades informa cuántos registros tienen un PN sin exponer LID, PN ni teléfonos, más la cantidad por tipo de mensaje. También agrupa las lecturas remotas por tipo y estado, con cantidad y última actualización, sin incluir destino, ID de comando o error. Para cada tipo de snapshot local devuelve el número de registros, la última escritura del snapshot, rutas de campos superiores y anidados, cuántos registros contienen cada ruta y la escritura más reciente de un snapshot que incluye la ruta. Como los snapshots pueden fusionar campos previos, esa fecha no prueba que el valor del campo se haya actualizado entonces. Los índices de listas se normalizan como `[]`, para contar una misma variable sin importar su posición, sin alterar nombres literales entre comillas. Los conteos permiten distinguir una variable presente en toda la colección de otra que solo aparece en algunos registros. Los nombres de ruta de más de 100 caracteres o que exceden los primeros 100 se omiten y se cuentan en `omitted_fields`. La lectura consume filas SQLite de forma incremental y limita las rutas retenidas a 10.000 por registro y por categoría; si alcanza esos topes, informa `field_inventory_truncated`. El tiempo de cálculo sigue dependiendo del tamaño total de los snapshots recorridos.

La respuesta no contiene nombres, teléfonos, JID, cuerpos de mensajes, valores de perfil, credenciales ni códigos QR. Sirve para ver qué partes del modelo se han observado y qué campos aparecieron; no implica que todas las entidades tengan esos campos ni que WhatsApp haya entregado el historial completo.

La cobertura de mensajes separa dirección entrante y saliente además del origen importado/en vivo. `last_live_message_at` corresponde solo a mensajes entrantes con fecha válida; la ausencia se determina por `live_inbound_count`, de modo que mensajes salientes o timestamps inválidos no se presentan como recepción actual.

El administrador puede iniciar desde Inicio una actualización secuencial de `all` (cuenta y grupos), `blocklist`, `communities`, `catalog`, `collections` y `newsletters`. Cada lectura se espera antes de iniciar la siguiente; los límites por recurso siguen aplicando y el botón no consulta identificadores nuevos de contactos. Si una lectura queda en curso por más de 90 segundos, la secuencia se detiene sin duplicarla. Salir de Inicio detiene los siguientes pasos. Además, el programador local rota automáticamente esas seis lecturas más `account_limits`, una cada 15 minutos, encolándolas para el worker existente. Espera si hay otra lectura pendiente o en curso; no duplica workers y solo corre con la línea conectada. El administrador puede pausar la rotación o elegir 15, 30, 60 o 120 minutos en Configuración. La actualización es de solo lectura: no envía mensajes ni modifica el perfil o los grupos.

La vista «Cobertura de datos observados» aparece en Inicio y se actualiza cada 15 segundos mientras esa pantalla permanece abierta. Los snapshots se consultan como agregados y claves JSON; los valores privados se siguen consultando en sus pantallas autorizadas.

El catálogo de funciones permite navegar y buscar todas las definiciones públicas de variables WHAPI. `GET /api/v1/capability-fields?limit=100&offset=0` requiere permiso `read` y recorre por páginas parámetros de URL/ruta/headers, campos de solicitud y campos de respuesta. Se puede agregar `q` (mínimo dos caracteres) para buscar por nombre, operación, endpoint, ubicación o categoría; `limit` admite hasta 500 y `offset` es cero-based. Cada fila indica método, ubicación, dirección, tipo, obligatoriedad, valores enumerados documentados y, para respuestas, código HTTP. Enumera hasta 100 valores y señala si el catálogo se truncó. No se devuelven valores de ejemplo ni datos de la cuenta. El inventario público se captura desde la referencia oficial; no demuestra que una variable esté disponible en la sesión conectada ni que WIS la implemente.


### Catalogo de la cuenta propia

El worker intenta primero la consulta publica visible. Solo si WhatsApp devuelve el codigo reconocido `public_catalog_unavailable`, cambia a la consulta autenticada `getCatalog` de Baileys para la cuenta conectada. Si el error aparece durante la paginacion, descarta cursor y resultados publicos parciales y reinicia desde la primera pagina privada. El reemplazo de productos y resumen es atomico en SQLite. La respuesta se etiqueta `own_account` y `checked_baileys_iq_fallback`; no se confunde con catalogo publico ni habilita edicion. Timeouts, fallas de transporte y codigos distintos no provocan un segundo intento, porque la primera consulta puede seguir pendiente.

### Canales por código de invitacion

El detalle de canales permite una consulta administrativa de solo lectura por código. Baileys devuelve una parte de los metadatos; WIS indica qué campos están disponibles y omite estado del chat, último mensaje, imágenes con URL firmada y el código usado. El código solo viaja en memoria por la API y el IPC local; no se escribe en SQLite ni en auditoría.


### Perfiles de contactos conocidos

La lectura manual de perfil solo usa contactos ya guardados con JID exacto. Consulta el estado de WhatsApp y, para un PN, el perfil Business expuesto por Baileys. Guarda `available_fields` y evidencia de correlacion; omite campos vacios o ausentes, limita sitios y horarios y elimina las claves no permitidas. Un LID nunca se convierte a PN. Si ninguna lectura obtiene respuesta del proveedor, la operacion queda fallida. La cobertura local cuenta las rutas observadas sin exponer sus valores.


### Actualizacion programada de canales

La ruta newsletters intenta refrescar hasta 20 canales ya conocidos localmente. Si una respuesta falla, conserva los datos anteriores marcados como desactualizados y continua mientras el socket no tenga una lectura sin resolver. El resumen registra attempted_count, failure_count, unattempted_count, partial y complete. Esta lista no representa un directorio global de canales.
