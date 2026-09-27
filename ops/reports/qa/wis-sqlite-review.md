# WIS WhatsApp SQLite — QA independiente

## Integración final del catálogo público — revisión independiente

Apta técnicamente para reinicio en modo lectura. Pruebas aisladas combinadas de backend, worker, adaptador y QA: **29/29 PASS**. Se revisó la fábrica inyectada en runtime, ligada al JID actual, con configuración en memoria y descubrimiento bajo comando manual. No incorpora fallback de autenticación ni reintentos automáticos. Conserva exclusión de solicitudes pendientes, comprobación de propietario y rechazo de resultados de otro socket.

Se detectaron y el propietario corrigió tres P2 antes del dictamen: productos con product_id se descartaban; el indicador truncated del adaptador se perdía permitiendo reemplazar datos previos con una lista recortada; los códigos antiguos de error permanecían tras el éxito. La regresión verifica recuperación desde error, identificador alternativo, preservación de snapshots cuando la respuesta es parcial y flags de productos anidados. Los éxitos limpian provider_code/status_code; los fallos conservan datos previos como stale y anuncian alcance público parcial.

El lector limita cada página pública a cincuenta elementos; worker consulta como máximo tres páginas de productos y una de colecciones. El resumen conserva cursores/truncamiento y known_only, por lo que la API no anuncia inventario Business completo. Las respuestas reales informadas por el orquestador no fueron reproducidas por QA. Este dictamen no valida envíos ni funciones administrativas del catálogo.

## Adaptador HTTP del catálogo público — revisión independiente

La revisión estática confirma destinos HTTPS restringidos, endpoint GraphQL fijo, cookies omitidas, redirecciones rechazadas, extracción de configuración sin ejecutar JavaScript, token sólo en memoria y límites de tiempo/tamaño. El objetivo de consulta queda fijado por ownJid; los resultados identifican el alcance public_catalog, que no equivale a acceso administrativo al catálogo Business.

Hallazgo P2 corregido por el propietario: un cuerpo JSON null provocaba TypeError y productos null/sin identificador se aceptaban como registros verificados. Ahora cuerpo, datos, contenedor y filas deben ser objetos planos; los identificadores deben ser valores estables no vacíos. Se validan también productos anidados y filas fuera del límite visual. La regresión independiente en `test/qa/catalog-http.test.mjs` fallaba antes de corregir y ahora pasa. Ejecución independiente de pruebas del adaptador más QA: **5/5 PASS**. Apto para su lectura pública acotada; no se evaluó todavía integración en worker ni disponibilidad real del proveedor. No se realizaron consultas reales desde QA.

## Historial, detalle de mensajes y multimedia — revisión independiente

Sin hallazgos P1/P2 bloqueantes en este incremento. Pruebas aisladas: `node --test local/worker.test.mjs local/backend.test.mjs test/qa/checked-reads.test.mjs test/qa/sqlite-review.test.mjs test/qa/api-expansion.test.mjs`, **23/23 PASS**; sintaxis de messages.js válida. No hubo consultas a la cuenta real ni reinicios desde QA. El adaptador catalog-http en desarrollo queda fuera de este dictamen.

La solicitud de historial exige administrador, conversación conocida y ancla persistida; pide cincuenta registros. Se contrastó el uso de milisegundos con fetchMessageHistory de la dependencia instalada. Es una solicitud de datos al dispositivo asociado y no un mensaje al contacto. Sólo una correlación explícita por request_id cambia la solicitud a arrived; no se declara historial completo y se distingue la sincronización global de la cuenta. El contador recibido contabiliza el evento del proveedor, no garantiza que todos los registros sean nuevos o persistibles.

El detalle y búsqueda requieren permiso read, los filtros son parametrizados y la multimedia exige nombre permitido, registro en base y contención realpath dentro del directorio privado. La interfaz escapa texto y utiliza rutas locales autenticadas. Las citas, reacciones y confirmaciones conservan campos permitidos, sin objetos completos de credenciales ni URLs firmadas. Edición y revocación procesan eventos recibidos; las pruebas no envían mensajes a WhatsApp.

Límites: revisión visual estática sin navegador real; recuperación efectiva depende del dispositivo/proveedor; no se garantiza recuperación completa ni descarga de multimedia histórica. Los metadatos recibidos en eventos y las pruebas con sockets simulados no equivalen a aceptación integral con una cuenta real.

## Validación de respuestas crudas — revisión final

Apto técnicamente para reiniciar el worker en modo lectura. La corrección reemplaza los wrappers que podían convertir un timeout en una lista vacía: catálogo y colecciones requieren un IQ result con contenedor y elementos válidos antes de ejecutar el parser instalado. Bloqueados, grupos y comunidades también validan la respuesta cruda. Undefined se clasifica como read_timeout; un contenedor ausente o incorrecto como invalid_response. Los errores del proveedor sólo conservan código permitido y estado numérico.

El plazo vigente es 30 segundos en la consulta Business y 35 segundos externos; las listas usan 10/12 segundos. Se conserva el bloqueo de una solicitud pendiente y la verificación de sesión propietaria. Sólo las respuestas comprobadas producen response_verified:true. La evidencia anterior de 61,576 segundos no demuestra una respuesta válida ni un catálogo vacío.

Ejecución independiente: `node --test local/worker.test.mjs test/qa/checked-reads.test.mjs test/qa/sqlite-review.test.mjs`, **18/18 PASS**. Se añadieron regresiones independientes para respuesta ausente, contenedor ausente, error 403 sanitizado y contenedores válidos vacíos. QA no accedió a la cuenta real. La disponibilidad real de catálogo/colecciones sigue pendiente de evidencia del proveedor; este dictamen valida el tratamiento de respuestas, no paridad completa ni envíos.

## Plazo específico del catálogo — revisión posterior

Revisión de aislamiento aprobada, pero **aprobación funcional del catálogo retirada** hasta validar la respuesta cruda del proveedor. `readBudgetMs` asigna 75 segundos exclusivamente a getCatalog/getCollections y conserva 12 segundos para las demás consultas. El override de pruebas exige número finito, positivo y como máximo 75000 ms. Se mantiene una única solicitud pendiente por socket, la clasificación sanitizada y la verificación de propietario/socket al completar.

Evidencia independiente: `node --test local/worker.test.mjs`, **10/10 PASS**. El orquestador informó después que Baileys puede absorber un timeout y convertir undefined en productos vacíos. Por ello el evento tardío a los 61,576 segundos **no demuestra una respuesta válida ni un catálogo vacío**. Debe comprobarse el nodo crudo antes del parser y cubrir este caso con una regresión. QA no ejecutó ni repitió esa lectura. Aumentar el plazo por sí solo no resuelve el defecto.

## Diagnóstico sanitizado de lecturas — revisión posterior

Apto para reiniciar el worker actualizado en modo lectura. `classifyReadError` sólo devuelve un código conocido y un estado HTTP entero válido; no persiste mensajes, datos ni trazas del proveedor. Los eventos de resultados tardíos capturan el identificador de comando y método original, verifican propietario/socket vigente y no convierten automáticamente un timeout en una lectura completada. El bloqueo de solicitudes pendientes continúa evitando reintentos simultáneos.

Se detectó y corrigió acceso heredado al prototipo en el mapa de códigos (`constructor`, `__proto__`, etc.); ahora usa `Object.hasOwn`. Se añadió regresión independiente. Ejecución QA: `node --test local/worker.test.mjs test/qa/sqlite-review.test.mjs`, **13/13 PASS**. Incluye error tardío 403 sanitizado, correlación y ausencia de texto sensible. No se consultó ni reintentó catálogo, comunidades o canales de la cuenta real desde QA.

## Catálogo, comunidades y supervisor — revisión posterior

Dictamen: apto para reiniciar la versión ampliada en modo lectura, manteniendo envíos desactivados. No se realizaron consultas ni acciones sobre la cuenta real desde QA.

- Verificados contra la implementación instalada de Baileys los métodos de catálogo propio, colecciones, bloqueados, comunidades y canales conocidos: consultas de lectura, objetivos acotados y listas explícitas de campos. Se excluyen URLs CDN firmadas, credenciales y códigos de invitación.
- Límites explícitos: hasta tres páginas de catálogo, cien colecciones, veinte canales conocidos y dos mil comunidades; el resultado conserva indicadores de truncamiento/observación parcial.
- P2 corregido: comunidades abandonadas permanecían como actuales tras una respuesta completa vacía. Ahora la sustitución es transaccional únicamente tras una respuesta válida y completa; fallos y respuestas truncadas preservan registros anteriores.
- P2 corregido: consultas fallidas no actualizaban disponibilidad. Ahora el resumen registra fallo sanitizado, intento y obsolescencia conservando datos y última consulta exitosa.
- P2 corregido: segundo inicio podía sobrescribir el PID del supervisor original. Lock exclusivo impide doble supervisor; limpieza de metadatos sólo afecta al propietario. Prueba aislada verifica doble inicio rechazado y cierre IPC de ambos hijos conservando sesión.
- P2 corregido en explorador: lista de bloqueo aún no consultada se presentaba como no disponible; ahora distingue sin recopilar, indisponible, truncada y parcial. Datos dinámicos y detalles permanecen escapados.
- Pruebas independientes previas a los últimos ajustes: **14/14 PASS** (backend, worker, supervisor y regresiones QA). Después de las correcciones se reejecutó worker **7/7 PASS**, supervisor **1/1 PASS** y sintaxis de explorer.js. La prueba worker cubre fallo que conserva datos, truncamiento de 2001 comunidades y respuesta completa vacía que elimina registros obsoletos.

## Ampliación de lectura — revisión posterior

Backend y worker aptos para reinicio con envíos desactivados. Se revisaron tablas adicionales snapshots/events/read_commands, paginación, multimedia autenticada y consultas de metadatos. El esquema es aditivo; la prueba de reapertura conserva contacto y sesión. No se consultó ni alteró la cuenta vinculada durante QA.

- Los comandos admitidos sólo invocan fetchStatus, fetchPrivacySettings, getBusinessProfile, groupFetchAllParticipating y groupMetadata. El endpoint requiere administrador y valida objetivos existentes. No hay despacho arbitrario de métodos del socket.
- Los snapshots/eventos usan listas explícitas de campos; quedan fuera credenciales, QR, códigos de invitación y envelopes criptográficos. Un timeout bloquea más lecturas en ese socket hasta que se resuelva la consulta pendiente, evitando acumulación de solicitudes.
- Las consultas paginadas parametrizan búsqueda y límites; la descarga de archivos verifica autenticación y ruta real dentro del directorio de multimedia.
- Corregidos durante revisión: horarios comerciales estructurados y fechas de estado descartados por el normalizador; búsqueda de una operación antigua aplicada después del límite de 100 registros.
- Ejecución independiente: backend (2), worker (6) y QA SQLite (3), **11/11 PASS**. Regresión adicional `test/qa/api-expansion.test.mjs`, **1/1 PASS**: operación antigua entre 130 registros, paginación y denegación de cuenta/sync a token de lectura, snapshot reservado y traversal multimedia.
- Esta aprobación técnica cubre lectura y almacenamiento local. No certifica todas las funciones WHAPI ni habilita mutaciones de cuenta, publicaciones, campañas o envíos. QA visual del panel ampliado se informa por separado.
- Panel ampliado revisado estáticamente: campos, JSON y referencia WHAPI escapados; multimedia usa endpoint local autenticado; detalles de esquemas se solicitan al abrir un método. Se detectó y corrigió un P2: refrescar más de 200 conversaciones enviaba un límite inválido; ahora se consultan tramos de hasta 200 y se deduplican por ID. `node --check local/public/live.js` aprobado. No se operó el navegador ni la cuenta desde QA.

Fecha: 2026-09-27. Alcance: runtime activo `local/`, esquema SQLite, panel estático, scripts locales y dispatcher. No se usaron Supabase, Docker, Chrome ni conexiones reales a WhatsApp durante QA.

## Dictamen para inicio local

Apto para iniciar el panel en loopback y generar el QR solicitado con **WIS_OUTBOUND_ENABLED=false**. Este dictamen no habilita envíos, campañas ni entregas externas de webhooks. La verificación real de identidad y sesión queda pendiente del enlace del usuario.

## Hallazgos corregidos y revisados

- Contrato SQLite actualizado: contactos LID admiten teléfono desconocido; operaciones admiten delivered/read sin provocar excepción del worker.
- Tokens validan el permiso de la ruta; no requieren implícitamente read para operaciones de escritura.
- Eventos de mensajes/operaciones generan entregas durables mediante triggers para webhooks habilitados.
- Dispatcher reclama sólo hooks habilitados, limita intentos, recupera claims interrumpidos y conserva controles de destino público, host permitido, DNS fijado, firma y plazo absoluto.
- Inicio normal protege `.local` mediante setup antes de arrancar procesos; backups se guardan en `.local/backups`.
- Worker fusiona echo propio con el mensaje encolado dentro de una transacción y determina MIME de audio según el archivo.
- Confirmaciones anticipadas: buffer acotado a 5000 identificadores conserva el estado máximo y lo aplica al confirmar el envío. Prueba independiente simula read antes del retorno de sendMessage y confirma que delivered/sent posteriores no lo degradan. Hallazgo cerrado.
- Root informó preservación privada de la base preliminar vacía y recreación del esquema corregido. CREATE TABLE IF NOT EXISTS no sustituye una estrategia de migraciones para futuras bases con datos.

## Evidencia independiente

- `rtk npm run test:local`: **4/4 PASS**, autorización HTTP, consentimiento, transacción de cola, replay, QR privado, identidad, rutas, lease exclusivo y persistencia con socket simulado.
- `rtk node --test test/qa/sqlite-review.test.mjs`: **3/3 PASS**, mensajes LID y estados de receipt compatibles; identidad completa equivocada desconecta y borra QR; confirmaciones anticipadas preservan read. El envío de esta prueba usa exclusivamente un socket simulado y SQLite en memoria; no modifica flags del proceso real.
- Inspección estática: host y origen restringidos a loopback; cookie HttpOnly/SameSite Strict; contraseña derivada con scrypt; tokens almacenados por hash; rutas estáticas y multimedia acotadas; salida dinámica del panel escapada; QR reservado al administrador y con vencimiento.

## Límites y seguimiento

- Ninguna prueba abrió un socket real de WhatsApp ni envió mensajes. Reinicio con sesión real, revocación, multimedia recibida y confirmaciones reales necesitan validación posterior.
- El runtime implementa una conexión y un administrador local. No certifica cuentas de operador, aislamiento multiconexión ni paridad completa de WHAPI.
- La protección de ACL debe verificarse en el equipo efectivo; el informe revisa su invocación en el arranque, no certifica configuración histórica de permisos ajena al proyecto.
- El arranque tras interrupción de bootstrap, la restauración completa con sesión y la actualización de esquemas con datos requieren pruebas específicas adicionales.
- La revisión del panel fue estática; no se realizó QA visual o de navegador en esta revisión.
