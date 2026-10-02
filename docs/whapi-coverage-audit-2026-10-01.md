# Revalidación de cobertura WHAPI — 2026-10-01

Se ejecutó `npm run audit:whapi-fields -- --summary` después del despliegue. El cálculo devolvió 182 métodos, 177 con campos de respuesta, 14 rutas exactas y 127 equivalencias semánticas revisadas, de un total de 44.628 rutas de respuesta documentadas. Hay 23 métodos con alguna observación, 4 con todas sus rutas observadas y 154 sin ninguna.

**Alcance de la evidencia:** el comando leyó `.local/wis.sqlite` de este checkout y el catálogo WHAPI versionado. No consultó la base de EasyPanel ni prueba disponibilidad actual de datos del número. Estos totales describen la copia local; no son cobertura productiva y no demuestran paridad.

**Próxima ruta:** con una sesión administrativa activa en Chrome, obtener el resumen agregado autenticado de producción y comparar únicamente `observed_at`, cantidad de rutas y estados de lectura. Después, seleccionar la brecha Get menos cubierta con un getter público verificable. No leer ni copiar contenido personal.

## Evidencia obsoleta en el explorador

La cobertura conserva snapshots históricos como prueba de que un campo fue observado, pero esa cuenta por sí sola no indica vigencia. El informe de campo ahora separa los registros cuyo payload tiene `stale: true` y los muestra como evidencia obsoleta en el detalle WHAPI. No los elimina ni los etiqueta como actuales; las marcas de tiempo siguen siendo las del guardado/último éxito explícito. Pruebas: `data-coverage.test.mjs` y `capability-audit-freshness.test.mjs`.

## Verificación agregada de producción — 2026-10-01

Consulta de solo lectura a la base del servicio EasyPanel, sin seleccionar payloads, identificadores ni contenido. La conexión figura `connected`, el lease del worker estaba vigente hasta `2026-10-01T04:56:58Z`, y la recolección programada estaba habilitada cada 15 minutos. La última ruta encolada era `disappearing_mode` a las `04:47:07Z`, con próxima ejecución prevista a las `05:02:07Z`.

En esa observación había 18 grupos, 567 conversaciones, 907 contactos, 1.105 mensajes almacenados y 3.748 observaciones de identidad. Son conteos, no una copia o auditoría del contenido. Perfil, estado, grupos y la lectura `all` se actualizaron alrededor de `04:49:48Z`; contactos alrededor de `04:50:19Z`. Historias y catálogo aún conservaban snapshots del 29 y 30 de septiembre, respectivamente. La agenda estaba activa, pero esto no prueba que cada variable WHAPI se actualice en cada ciclo; la frescura se evalúa por campo y tipo.

El CLI productivo de cobertura por campo sí se ejecutó en modo resumen sobre la base de EasyPanel: 182 métodos, 177 con respuesta, 23 con alguna observación y 4 con todos sus campos observados; 14 rutas exactas y 147 equivalencias semánticas frente a 44.628 rutas de respuesta (44.467 aún sin observación). El total de métodos coincide con el checkout; las equivalencias semánticas productivas superan en 20 las registradas por el resumen local anterior. Esto mide observaciones contra el catálogo, no equivalencia funcional ni una garantía de que todos los campos estén vigentes.

El resumen de lecturas productivas registraba `all` completado 174 veces (la última cerca de `04:49:48Z`) y dos fallos históricos por desconexión; para catálogo había 20 fallos históricos, 17 de ellos por timeout, con último fallo el 30 de septiembre a `23:15Z`. La consulta separada no mostró identificadores ni destinos. El hecho de que una nueva lectura `all` se complete no renueva por sí solo el catálogo, pues ese recurso tiene un ciclo aparte.

### Secuencia de refresco autorizada desde el panel

Se ejecutó una vez el botón existente de seis lecturas secuenciales, todas de solo consulta. Resultado que informó el panel: **5/6 correctas**. `all`, `blocklist`, `communities`, `collections` y `newsletters` registraron nuevas lecturas; los contadores históricos de comunidades, colecciones y newsletters avanzaron en uno. El inventario de campos siguió en 398, sin nuevas rutas de respuesta WHAPI observadas. La sesión permaneció conectada y el recolector automático siguió activo.

El paso `catalog` terminó en `read_timeout`: el total de fallos de catálogo pasó de 20 a 21 y el agregado de ese código pasó de 17 a 18. No se inició otro intento. Una consulta posterior de solo lectura confirmó que el comando quedó en estado terminal `failed` y que no hay eventos `read.late_completed` ni `read.late_failed` retenidos para estas lecturas. Los otros cinco recursos terminaron correctamente; el panel conserva 398 rutas de campo y no hubo nuevas observaciones WHAPI. La conexión siguió verificada y el recolector programado permaneció activo.

El código local revela dos causas plausibles, aún no confirmadas en producción. Primero, el descubrimiento consulta varios paquetes estáticos públicos en paralelo y antes fallaba todo si uno devolvía timeout/transporte, aunque otro paquete tuviera la configuración requerida. Segundo, la ruta puede paginar hasta tres páginas públicas y, si hay error, reiniciarse con hasta tres páginas Baileys. Los 210 s anteriores eran por llamada, no por el comando completo, por lo que no limitaban esa suma de forma global. Ambos casos podían terminar como `read_timeout`; los registros productivos no permiten distinguir las fases. La consulta confirmó que el comando ya estaba terminal; no se repitió.

**Siguiente ruta:** no volver a disparar la secuencia completa. Localmente, el panel espera hasta 240 s, mientras el worker ahora aplica un límite absoluto de 210 s al comando `catalog`, incluyendo descubrimiento, páginas y fallback; cada llamada usa el tiempo restante. Si una llamada subyacente no puede cancelarse, el worker registra el comando terminal y mantiene bloqueadas lecturas posteriores en ese socket hasta que la solicitud termine, evitando solapamientos. El descubrimiento además tolera un fallo transitorio individual y limita el escaneo a 40 s, con paquetes de hasta 10 s. Una prueba confirma el límite entre páginas y que una página tardía no inicia una tercera llamada. Suite completa, lint/build y revisión independiente deben repetirse después de este cambio. El cambio no está desplegado. Próximo paso: QA independiente; después de autorizar despliegue, una lectura puntual y verificar conteos/estado, sin repetir la secuencia de seis. Mantener pendientes los GET del catálogo WHAPI sin getter Baileys público verificado, no aumentar el volumen de solicitudes y no marcar campos como cubiertos con evidencia antigua.

### Revisión posterior sin nuevas lecturas manuales — 2026-10-01

A las 05:17 UTC, Chrome todavía mostraba la sesión verificada y el worker activo; el último `all` programado había terminado con éxito a las 05:17 UTC. La ruta siguiente era `blocklist`, prevista para las 05:32 UTC. El catálogo conservó su último fallo a las 05:05 UTC; esta revisión no disparó ninguna lectura ni renovó el catálogo. El resultado es evidencia de continuidad de la sesión y del recolector, no de actualización de todos los campos.

### Ajuste del timeout y lectura puntual posterior — 2026-10-01

QA independiente aprobó el límite absoluto de 210 s por comando y después el control admin para actualizar solo el catálogo. EasyPanel informó `Success` para `fix: bound catalog reads end to end` y `feat: add targeted catalog refresh`. Tras el segundo despliegue, Chrome mantuvo `Conectado · identidad verificada`, worker activo y recolector dentro del intervalo. Se ejecutó una única consulta `catalog` desde el nuevo botón; terminó en `read_timeout`, el agregado quedó en 22 fallos de catálogo y los campos observados siguieron en 398. No se repitió. Esto valida el flujo de interfaz y el deploy, pero no la lectura de datos nuevos.

El explorador de WhatsApp Business mostró el alcance del último intento como `own_account`, el origen como `checked_baileys_iq_fallback` y el resultado como `read_timeout`. Esto confirma que se entró al fallback Baileys y que esa lectura agotó su presupuesto; el panel no conserva por qué falló primero la ruta pública, así que no se afirma si fue timeout, transporte o catálogo no disponible. Una comprobación local separada encontró la configuración pública y pudo llegar al endpoint GraphQL usando un JID sintético, que respondió `public_catalog_unavailable` en menos de un segundo. Eso no diagnostica la cuenta real ni confirma si tiene catálogo Business privado. No se repetirán consultas al catálogo hasta mejorar la telemetría por etapa o contar con evidencia de que el lector puede responder; conservar `read_timeout`, los datos existentes y la cobertura incompleta.

### Diagnóstico por etapa — publicado y verificado

El worker conserva solo una etapa de una lista fija (`public_catalog_page_discovery`, `public_catalog_bundle_scan`, consulta pública o getter Baileys), el código de fallo sanitizado que motivó el fallback y la etapa que terminó. La ruta `/api/v1/products` y la pantalla de WhatsApp Business muestran esos datos agregados; se excluyen payloads, tokens y mensajes remotos. El timeout externo se etiqueta al crearse como `public_catalog_read_deadline`, sin atribuirlo al endpoint. QA independiente aprobó la revisión de sanitización, preservación del scope anterior y limpieza del diagnóstico al completar intentos posteriores. El cambio está desplegado en EasyPanel. Una lectura puntual mostró `public_catalog_unavailable` para la ruta pública y `read_timeout` en `baileys_get_catalog`; el panel conserva ambas etapas y no presenta la ausencia como catálogo vacío. Chrome confirmó que la sesión siguió conectada con identidad verificada y el sitio volvió a cargar tras el despliegue. La lectura no se repitió. La cobertura sigue incompleta; la próxima ruta debe revisar el manejo de respuestas inválidas en las demás pantallas/API, sin volver a consultar el catálogo.

### Comparación de inventario tras el despliegue

El explorador autenticado de producción volvió a mostrar 182 métodos, 44.628 rutas de respuesta, 161 rutas observadas (14 exactas y 147 equivalencias revisadas), 44.467 sin observar, 23/177 métodos con alguna observación y 4 completos. El CLI local sobre `.local/wis.sqlite` reportó los mismos 14 exactos pero 127 equivalencias (44.487 sin observar). Son bases distintas: la diferencia de 20 equivalencias es evidencia de que el checkout no representa fielmente la cobertura productiva y no debe usarse para reemplazarla. Estos conteos no prueban paridad funcional; tampoco se recuperaron valores de contactos ni se copiaron al informe.

### Asociaciones de etiquetas: límite del getter

La dependencia fijada es `baileys@7.0.0-rc14`. Su interfaz tipa `labels.edit` y `labels.association` como eventos, que el worker persiste. No se encontró un getter público para pedir un inventario histórico completo; los eventos recibidos también podrían incluir asociaciones sincronizadas por WhatsApp. Por tanto, WIS muestra lo recibido durante la sesión, pero no promete reconstruir el historial completo. Una lista vacía no demuestra ausencia de etiquetas; las asociaciones de mensajes y la cobertura íntegra de WHAPI siguen siendo brechas explícitas.

### Aviso transitorio del resumen y diagnóstico seguro — 2026-10-01

Tras el despliegue anterior, la primera carga de Chrome mostró que el resumen no podía interpretar una respuesta del servicio. Una recarga posterior recuperó el panel y sus agregados (907 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos); la tarjeta de conexión seguía verificada. No se pudo atribuir aquella respuesta a una ruta concreta antes de corregir el diagnóstico, así que no se registra como causa resuelta. El cliente ahora identifica el prefijo controlado del endpoint y el estado HTTP, omite queries e IDs dinámicos y mantiene una lista permitida para las dos rutas fijas de diagnóstico. Las pruebas cubren 503 HTML, query/ID privados, esas rutas fijas y respuestas JSON válidas. Desplegado en EasyPanel y revisado por QA independiente (3/3 pruebas enfocadas; suite completa 226/226).

**Próxima ruta:** si el aviso reaparece, usar el endpoint y estado visibles para rastrear el fallo concreto. En paralelo, continuar el inventario de getters públicos de solo lectura por una ruta distinta; no repetir el getter del catálogo después de su `read_timeout` sin un cambio verificable en lector o transporte.

### Sesión vinculada y refresco manual verificados — 2026-10-01

Con la sesión administrativa existente en Chrome, Inicio mostró la conexión vinculada activa e identidad verificada. La recolección manual `all`, solicitada desde Configuración, terminó en estado `done` a las 06:43 (hora local); la tabla no mostró resultado ni error para esa solicitud. Inicio reflejó 908 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos, con 1.000 eventos, 28 tipos de datos guardados y 410 campos listados. Había cero operaciones pendientes o fallidas. No se inspeccionaron ni registraron valores, destinos o identificadores de contactos.

Configuración sigue mostrando la agenda de lecturas habilitada cada 15 minutos, lease vigente, envíos deshabilitados, webhooks deshabilitados e historial completo `false`. Inicio mantiene 50 lecturas fallidas históricas agregadas; la tabla de errores incluye `bot_list` (`provider_error`) y `catalog` (`read_timeout`). El contador de operaciones fallidas está separado de estos fallos de lectura. Que la lectura `all` haya terminado no resuelve esas rutas independientes ni completa el historial previo al enlace. La acción no envió mensajes, reintentó el catálogo ni cambió la sesión.

El catálogo visible en producción carga 182 métodos y 182 esquemas, y advierte que los candidatos y las variables observadas no prueban paridad. El valor agregado de metadatos grupales sigue limitado a grupos conocidos y no revela campos individuales. Permanecen brechas grandes de lectura y de operaciones no disponibles en Baileys.

**Próxima ruta:** revisar una lectura independiente pendiente distinta de `catalog` y `bot_list`, usando la ficha de frescura y únicamente evidencia agregada. Después documentar los getters sin método público y los campos aún no observados. No habilitar envíos, webhooks ni campañas como parte de esta verificación.

### Rotación automática confirmada en producción — 2026-10-01

Sin modificar la programación ni lanzar otra consulta manual, esperé el siguiente turno automático de `account_limits`. Configuración registró `done` a las 06:48 hora local (09:48:54 UTC), mantuvo el lease vigente y avanzó la próxima ruta a `account_username` para las 07:03 hora local. `catalog` y `bot_list` siguen figurando como fallos históricos independientes; el éxito de esta lectura no los resuelve. La agenda productiva ya cumple el intervalo de 15 minutos y rota entre tipos; no creé una segunda automatización para duplicar esa carga.

**Próxima ruta:** dejar que la ruta automática `account_username` termine y revisar solo estado, hora y presencia agregada. Mantener pausa de envíos y webhooks; luego avanzar a otra ruta con evidencia de lectura, sin repetir las que fallaron salvo que cambie el lector o la evidencia del transporte.

### Perfil Business: campos pendientes ya contemplados por el lector — 2026-10-01

Revisé en producción el detalle de `getbusinessprofile` y el allowlist del worker. El lector propio ya conserva de forma acotada `address`, `email`, `website[]`, zona horaria y hasta 28 entradas de horarios; el lector de perfiles Business de contactos conocidos también conserva dirección, email, sitios y las entradas recibidas. No hace falta ampliar el allowlist ni hacer consultas masivas a contactos.

El explorador autenticado reporta 8/12 rutas de respuesta para `getbusinessprofile`: se observaron el identificador correlacionado, descripción, objeto de horarios, zona horaria y cuatro componentes de configuración del horario. No se observaron dirección, email, lista de sitios ni la ruta de configuración de horarios como arreglo. La lectura propia terminó correctamente a las 06:43 hora local y los cuatro pendientes seguían indicados como “revisados sin observación”. Esto es evidencia de ausencia en la respuesta observada, no prueba de que esos campos estén vacíos en la cuenta. No registrar sus valores ni modificar el perfil.

**Próxima ruta:** el scheduler mostraba `account_username` para las 07:03 hora local. Esperar ese turno automático y validar solo si hubo respuesta correlacionada, su hora y estado; si no devuelve un resultado verificable, mantenerlo parcial y pasar a un getter de solo lectura distinto. No repetir el perfil Business, no consultar perfiles en lote y no habilitar operaciones de escritura.

El turno automático de `account_username` terminó en `done` a las 07:03 hora local. El explorador de datos muestra el snapshot actualizado, pero `response_verified` sigue falso y no apareció un campo `username`; por eso el endpoint sigue parcial y la respuesta no prueba que la cuenta carezca de nombre. El mismo panel fijó `contact_profiles` como próxima ruta para las 07:18 hora local. La sesión permaneció conectada y no se cambiaron datos de WhatsApp.

**Próxima ruta:** dejar completar `contact_profiles` y contrastar solo número de lecturas/estado/actualidad, sin copiar contenido ni IDs de contactos. Mantener el alcance automático acotado a contactos ya conocidos; no disparar un escaneo manual adicional ni ampliar el lote.

### Turno automático de perfiles y siguiente ruta — 2026-10-01

El panel autenticado confirmó que `contact_profiles` terminó `Completada` a las 07:18 hora local; su contador agregado pasó de 9 a 10. Los totales visibles se mantuvieron en 908 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos, y el explorador continuó listando 410 campos. No se inspeccionaron valores ni perfiles individuales, así que el resultado solo confirma que el lector programado completó su ciclo; no demuestra cobertura nueva ni que todas las propiedades de perfil estén disponibles.

La conexión permaneció `Conectada · identidad verificada`, el worker activo y el recolector dentro del intervalo. La siguiente ruta automática quedó en `group_requests` para las 07:33 hora local. Los mensajes en vivo todavía muestran su última recepción observada el 28/9; no hubo evidencia nueva de actividad entrante durante esta revisión.

**Próxima ruta:** dejar terminar `group_requests` y registrar únicamente hora, estado y conteos agregados; no copiar solicitudes, IDs, nombres ni números. Después seguir con el siguiente recurso de solo lectura habilitado por la agenda, conservando los envíos pausados y los webhooks deshabilitados.

### Solicitudes de grupos: error agregado y rotación continúa — 2026-10-01

La ejecución automática de `group_requests` terminó `failed` a las 07:33 hora local; la tabla solo registró `provider_error`, sin detalle seguro que permita atribuirlo a un motivo más específico. La agenda conservó el lease vigente y avanzó a `avatars` para las 07:48. No abrí ni registré solicitudes, nombres, números o IDs, y no repetí la lectura manualmente.

**Próxima ruta:** esperar `avatars` y revisar solo estado/hora. Si esa lectura falla, conservar el error agregado y avanzar por la rotación; no consultar avatares individuales.

La ruta automática `avatars` terminó `done` a las 07:48 hora local y el lease siguió vigente. La interfaz no mostró resultado agregado de propiedades nuevas, así que esto acredita el ciclo completado, no cobertura adicional. El scheduler avanzó a `bot_list` para las 08:03. No abrí archivos de avatar ni perfil individual.

**Próxima ruta:** esperar el turno de `bot_list`; revisar únicamente estado y código de resultado sanitizado. Si vuelve a fallar, dejar la ruta en fallo y continuar con el scheduler, sin llamadas manuales repetidas.

El turno automático `bot_list` terminó `failed` a las 08:03 hora local con el mismo código agregado `provider_error`; no apareció evidencia que justifique un reintento. El lease continúa vigente y la rotación avanzó a `disappearing_mode` para las 08:18. La respuesta de bots no se leyó ni se copió.

**Próxima ruta:** observar `disappearing_mode` en la siguiente ejecución y anotar solo estado/hora. Las rutas de lectura con fallos históricos siguen siendo brechas, no equivalencias demostradas con WHAPI.

El turno automático `disappearing_mode` terminó `done` a las 08:18 hora local; el panel no mostró campos agregados nuevos para esa lectura. El lease continuó vigente y la próxima ruta avanzó a `community_subgroups` para las 08:33. No se abrió ninguna conversación ni se consultaron valores individuales.

**Próxima ruta:** esperar la consulta limitada a subgrupos de una comunidad ya conocida y verificar únicamente estado/hora, sin listar nombres o participantes.

La ruta `community_subgroups` no se ejecutó: el scheduler la omitió a las 08:33 hora local por `known_community_required`; no había una comunidad conocida elegible. El lease sigue vigente y la siguiente ruta quedó en `all` para las 08:48. No busqué ni seleccioné una comunidad para forzar la lectura.

**Próxima ruta:** dejar que el ciclo `all` programado termine y revisar estado agregado; mantener fuera del informe nombres, participantes y contenido de conversaciones.

El ciclo automático `all` terminó `done` a las 08:48 hora local. La agenda mantuvo el lease vigente y avanzó a `blocklist` para las 09:03; los totales visibles del panel siguieron en 908 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos. No se inspeccionaron conversaciones ni listas de personas. La finalización confirma el ciclo secuencial, pero no recupera el historial anterior al enlace ni acredita paridad con todos los esquemas WHAPI.

**Próxima ruta:** esperar `blocklist` y registrar únicamente resultado agregado. No activar bloqueos ni realizar mutaciones.

La lectura programada `blocklist` terminó `done` a las 09:03 hora local; no se mostró resultado en la tabla de solicitudes. El scheduler conservó su lease y avanzó a `communities` para las 09:18. La lista se consultó en modo lectura, sin crear ni modificar bloqueos.

**Próxima ruta:** esperar `communities` y comprobar su estado, sin leer nombres, temas ni miembros.

El ciclo automático `communities` terminó `done` a las 09:18 hora local; la tabla no indicó error ni resultado adicional. La siguiente ruta automática quedó en `collections` para las 09:33, con el lease vigente. Este resultado confirma que terminó el lector, pero no implica descubrir comunidades globales ni completar los campos de WHAPI.

**Próxima ruta:** observar `collections` y sus conteos agregados, sin consultar títulos ni valores de colecciones.

`collections` terminó `done` a las 09:33 hora local. En ese mismo turno la agenda omitió `catalog` por `recent_read_timeout`, sin volver a ejecutar el lector que continúa fallando; luego avanzó a `newsletters` para las 09:48. El lease sigue vigente. No se leyó ningún título, mensaje de canal ni valor de colección.

**Próxima ruta:** esperar `newsletters` y verificar solo estado/hora; mantener el catálogo aplazado hasta que exista evidencia de transporte distinta.

La lectura automática `newsletters` terminó `done` a las 09:48 hora local, con el lease vigente y sin error en la tabla. La próxima ruta rotó a `account_limits` para las 10:03. El estado `done` no se toma como validación de cada subcampo de la referencia, y no se consultó contenido de canales.

**Próxima ruta:** verificar `account_limits` y el estado de conexión con conteos/rutas, sin copiar valores de cuota ni indicadores por cuenta.

El turno automático `account_limits` terminó `done` a las 10:03 hora local; no transcribí valores de cuota, estados ni timers. La siguiente ruta quedó en `account_username` para las 10:18, con el worker y el lease activos. La finalización del snapshot no valida todas las propiedades ni implica que WHAPI y Baileys compartan formato.

**Próxima ruta:** esperar la consulta correlacionada del username propio y documentar solo si hubo respuesta verificable, nunca el valor del usuario.

La lectura `account_username` terminó `done` a las 10:18 hora local y su contador agregado llegó a 13. En la tabla de campos, `response_verified` aparece en un registro con conteo verdadero cero; el campo `username` no aparece. Por lo tanto, no hay una respuesta propia correlacionada demostrada y el username continúa desconocido; no inferí que la cuenta carezca de él ni copié valores. La próxima ruta automática es `contact_profiles` a las 10:33, limitada a contactos conocidos.

**Próxima ruta:** verificar solo estado y cantidad de perfiles procesados; no abrir ni transcribir perfiles.

El lector automático `contact_profiles` terminó `done` a las 10:33 hora local; el lease siguió vigente y la siguiente ruta pasó a `group_requests` para las 10:48. La tabla no dio un resultado de campos agregado para el turno, por lo que no lo cuento como cobertura adicional. No se consultó ningún perfil individual.

**Próxima ruta:** esperar el siguiente `group_requests`; revisar solo el código agregado y no reintentar si persiste `provider_error`.

La lectura programada `group_requests` ahora terminó `done` a las 10:48 hora local, a diferencia del turno anterior con `provider_error`. El agregado de snapshots informa cinco registros con `response_verified`, pero cero marcados como verificados; por eso el estado exitoso de la operación no prueba una respuesta útil ni una lista actual de solicitudes. No abrí solicitudes ni inspeccioné grupo/destinatarios. La siguiente ruta rotó a `avatars` para las 11:03.

**Próxima ruta:** dejar correr `avatars` y confirmar únicamente estado/tiempo; mantener los campos de solicitudes como no verificados hasta obtener evidencia correlacionada explícita.

El ciclo automático `avatars` terminó `done` a las 11:03 hora local y el scheduler avanzó a `bot_list` para las 11:18. El registro agregado muestra un nuevo snapshot/ciclo, pero no expone contenido y no basta para demostrar nuevas URLs o metadatos de perfil; no inspeccioné avatares individuales. El lease siguió vigente.

**Próxima ruta:** observar si `bot_list` se ejecuta o se omite por enfriamiento; registrar solo tipo, hora y código general.

`bot_list` se ejecutó automáticamente a las 11:18 hora local y terminó `failed` con `provider_error`. El scheduler mantiene el lease y rotó a `disappearing_mode` para las 11:33. No consulté la lista devuelta ni lancé una segunda prueba; la evidencia agregada no identifica la fase ni la causa del error.

**Próxima ruta:** dejar que el ciclo `disappearing_mode` avance; no insistir en `bot_list` hasta que el lector o la evidencia de transporte cambien.

### Revalidación del catálogo WHAPI y versión Baileys — 2026-10-01

Volví a descargar el índice público y procesé sus definiciones: siguen siendo 182 métodos y 182/182 esquemas extraídos, sin errores. El diff estructural de `public/whapi-capabilities.json` y `public/whapi-fields.json` contra la captura de las 03:25 UTC contiene solo `captured_at`; no cambiaron métodos ni campos/operaciones. El registro npm también mantiene `baileys` en `7.0.0-rc14` como `latest` (legacy `6.7.24`), así que no apareció una versión nueva para justificar otro barrido de API.

Esto confirma que el catálogo público no cambió, no que Baileys implemente sus 182 métodos. Los artefactos quedaron recapturados a las 14:36–14:37 UTC; la cobertura propia sigue pendiente de validar en las rutas marcadas parcial/no soportada.

**Próxima ruta:** retomar la agenda productiva en `community_subgroups`; la última ejecución verificó que no había una comunidad conocida elegible, así que aceptar la omisión automática y pasar luego a otra lectura.

La agenda omitió `community_subgroups` a las 11:49 hora local con `known_community_required`; no hay comunidad conocida elegible y no seleccioné ninguna manualmente. El worker conserva su lease. Avanzó a `all` para las 12:04, sin enviar mensajes ni cambiar la cuenta.

**Próxima ruta:** esperar el ciclo programado `all` y anotar únicamente estado/timestamp agregado, manteniendo excluidos los contenidos personales.

El ciclo `all` finalizó `done` a las 12:04 hora local y el panel permaneció conectado. La agenda avanzó a `blocklist` para las 12:19. Los agregados del overview cambiaron de 908 a 911 contactos; conversaciones 567, mensajes 1.512, grupos 18, tipos guardados 28 y rutas de campo 410 se mantuvieron iguales. El historial completo continúa en No. El contador global de lecturas fallidas muestra 53 (52 en la captura anterior); no atribuyo ese aumento al ciclo `all` porque el contador reúne otros turnos intermedios. No accedí a los tres registros nuevos ni a conversaciones.

**Próxima ruta:** esperar `blocklist` y revisar estado, conexión y conteos agregados; no tocar bloqueos.

El lector programado `blocklist` terminó `done` a las 12:19 hora local; el worker conserva su lease y la siguiente ruta rotó a `communities` para las 12:34. No se modificó la lista. El catálogo WHAPI recapturado no tuvo cambios estructurales y sigue sirviendo de referencia, no de evidencia de variables disponibles en esta sesión.

**Próxima ruta:** verificar si la lectura de comunidades añade recursos conocidos, usando solo conteos, sin exponer sus nombres o miembros.

`communities` terminó `done` a las 12:34 hora local; la agenda continuó con `catalog` para las 12:49. El estado disponible no expone un resultado agregado de campos para el ciclo de comunidades, por lo que no lo interpreto como nuevas comunidades conocidas. El siguiente intento de catálogo está dentro de la agenda existente tras su enfriamiento; no lo ejecuté manualmente ni abrí productos/valores.

**Próxima ruta:** observar el intento programado de `catalog` tras el enfriamiento y guardar solo la fase/código sanitizado y el estado del worker.

La ruta `catalog` volvió a ejecutarse desde la agenda existente a las 12:49 y terminó `failed` con `read_timeout`. No se lanzó una consulta manual. La siguiente ruta quedó en `collections` para las 13:04; el timeout es recurrente, pero la fase y causa no están determinadas. No se afirma que el catálogo de la cuenta esté vacío.

**Próxima ruta:** dejar que `collections` siga la rotación y guardar su resultado agregado. Para reintentar catalog hace falta cambiar o diagnosticar el transporte/lector, no repetir la misma llamada.

`collections` terminó `done` a las 13:04 hora local con el lease activo; no se inspeccionaron nombres, productos ni payloads de colecciones. No apareció evidencia agregada de rutas de campo nuevas respecto de las 410 ya listadas. La agenda avanzó a `newsletters` para las 13:19.

**Próxima ruta:** dejar que `newsletters` termine y revisar solo estado/hora y cambio de conteos de rutas; no leer contenido de canales.

La lectura programada `newsletters` terminó `done` a las 13:19 hora local. No abrí canales ni mensajes, y la vista de campos no señaló nuevas rutas observadas; los 410 campos siguen siendo el inventario actual. La agenda avanzó a `account_limits` para las 13:34, con el worker y el lease activos.

**Próxima ruta:** revisar el estado de `account_limits` y la frescura, sin registrar valores de cuota ni inferir un límite seguro de envío.

El ciclo automático `account_limits` terminó `done` a las 13:34 hora local; el worker y el lease siguieron activos. La próxima ruta es `account_username` a las 13:49. Los valores de cuota no se copiaron al informe ni se usaron para sugerir volúmenes de envío.

**Próxima ruta:** comprobar únicamente si la lectura de `account_username` recibe una respuesta propia verificable; jamás registrar el nombre de usuario.

El ciclo automático `account_username` terminó `done` a las 13:49 hora local, pero el agregador de cobertura continúa mostrando un registro con `response_verified` y cero verdaderos; no aparece una ruta de campo `username`. El getter, por tanto, no verificó un username para esta cuenta; el nombre permanece desconocido (no se infiere ausencia). La siguiente ruta es `contact_profiles` a las 14:04, aún acotada a contactos ya conocidos.

**Próxima ruta:** revisar únicamente estado/hora del lote de perfiles; no abrir valores individuales.

El lote automático `contact_profiles` terminó a las 14:04 hora local y el panel siguió conectado con el worker activo. La agenda rotó a `group_requests` para las 14:19. Los agregados pasaron de 915 a 917 contactos; las conversaciones (567), mensajes (1.512), grupos (18) y las 410 rutas de campo permanecieron iguales. La ruta `contact.status.status` pasó de 32 a 35 registros, mientras el conteo de textos no vacíos permaneció en 19. No se inspeccionaron los perfiles individuales ni se repitió manualmente la lectura.

**Próxima ruta:** revisar el resultado programado `group_requests` con solo conteos y estado sanitizado; no abrir solicitudes ni seleccionar grupos o participantes.

La ruta programada `group_requests` terminó `done` a las 14:19 hora local y rotó a `avatars` para las 14:34; la conexión y el worker siguen activos. El overview registra 918 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos; continúan 410 rutas de campo observadas. El índice de snapshots muestra seis registros con el campo `group_requests.requests` y no marca nuevos textos no vacíos; esto no permite inferir el número de solicitudes ni que la lista esté vacía. No se consultaron destinos, solicitudes ni participantes.

**Próxima ruta:** comprobar el lote programado `avatars` solo por estado y conteos; no abrir ni exportar imágenes.

El lector programado de `avatars` terminó a las 14:34 hora local; el historial agregado de esa ruta avanzó de cinco a seis lecturas completadas y la tabla sigue listando 410 rutas observadas, sin evidencia de nuevas variables. La conexión WhatsApp continúa verificada y el worker activo. No abrí imágenes ni consulté destinos; la interfaz de cobertura no expone el valor de `available_count`, así que no afirmo cuántas fotos resultaron disponibles. La siguiente ruta es `bot_list` a las 14:49.

**Próxima ruta:** registrar solo el estado y código sanitizado del turno automático `bot_list`, que tiene fallos históricos; no repetirlo manualmente.

### Estado funcional visible del catálogo en producción — 2026-10-01

Revisé la matriz autenticada `#capabilities` en Chrome sin abrir fichas de recursos ni valores privados. La interfaz enumera 182 funciones y 182 esquemas: 0 métodos verificados de punta a punta, 61 parciales, 120 pendientes y 1 no soportado. Estos estados son distintos de la cobertura por campos: que cuatro métodos tengan todas las rutas de respuesta inventariadas/observadas no los convierte en métodos verificados, como advierte la propia matriz. La página quedó nuevamente en Vista general; no se modificó el runtime productivo.

**Próxima ruta:** esperar el intento automático `bot_list` y, tras registrarlo, escoger una ruta pendiente con getter disponible que no dependa de ese método ni del catálogo agotado por timeout.

El turno automático `bot_list` terminó `failed` a las 14:49 hora local con el código sanitizado `provider_error`; el contador de fallos pasó de nueve a diez. La cuenta permaneció conectada y el worker activo. La agenda rotó a `disappearing_mode` para las 15:04. No repetí `bot_list` manualmente: el resultado sigue sin identificar una fase o variable nueva, por lo que insistir con el mismo IQ no aportaría evidencia adicional.

**Próxima ruta:** revisar el estado agregado del `disappearing_mode` programado y comprobar qué campos fueron realmente devueltos, sin modificar la retención de ningún chat.

La consulta automática `disappearing_mode` quedó completada a las 15:04 hora local; su historial subió de siete a ocho éxitos y la matriz registra el campo numérico `duration_seconds` en ocho de nueve snapshots de esa clase. El inventario de campos sigue en 410 rutas. Esto confirma que se guardó un valor validado, pero no se inspeccionó ni se expuso la duración de ningún chat; tampoco se cambió su temporizador. El worker continúa activo. La siguiente ruta de la agenda es `community_subgroups` a las 15:19; el scheduler puede omitirla porque exige una comunidad elegible ya conocida.

La comparación de esquema confirma que `getgroup.ephemeral` de WHAPI es numérico y su equivalencia revisada en WIS es `group.ephemeralDuration`. El `disappearing_mode.duration_seconds` de un chat es otro getter y no se mapea a `getcall.duration_seconds`; la coincidencia del nombre no basta para afirmar equivalencia.

**Próxima ruta:** respetar la condición del scheduler para `community_subgroups`; si se omite por falta de comunidad conocida, seguir con el próximo tipo de lectura en la rotación en vez de elegir un destino manualmente.

Configuración confirmó que el scheduler omitió `community_subgroups` a las 15:19 hora local con `known_community_required`, mantuvo el lease y programó `all` para las 15:34. Esto valida la salida prevista por la regla de selección; no se eligió una comunidad ni se ejecutó una consulta manual.

El turno automático `all` terminó a las 15:34 y la agenda avanzó a `blocklist` para las 15:49. La agenda local subió de 918 a 922 contactos; conversaciones (567), mensajes (1.512), grupos (18) y rutas de campo (410) no cambiaron. No abrí los cuatro contactos nuevos, chats ni miembros de grupos. La sesión y el worker continuaron activos.

**Próxima ruta:** revisar solo el estado agregado de `blocklist`; no consultar ni exportar identificadores bloqueados.

La lectura programada `blocklist` terminó a las 15:49 hora local y su contador agregado de lecturas completadas pasó a 24. La conexión siguió verificada con worker activo; el panel conserva 922 contactos, 567 conversaciones, 1.512 mensajes, 18 grupos y 410 rutas de campo. No se consultó la lista ni se copiaron identificadores. La siguiente ruta programada es `communities` a las 16:04.

`communities` terminó a las 16:04 hora local; el historial agregado avanzó de 25 a 26 lecturas completadas. Los contadores de entidades y las 410 rutas observadas no cambiaron; conexión y worker siguen activos. La interfaz no aporta evidencia de una nueva comunidad elegible ni de campos nuevos, así que no elijo un destino para subgrupos. La próxima ruta es `collections` a las 16:19.

`collections` completó su ciclo a las 16:19 y el historial agregado subió a 24 lecturas completadas. Los contactos aumentaron de 922 a 923; conversaciones (567), mensajes (1.512), grupos (18) y rutas observadas (410) permanecieron iguales. La conexión y el worker siguen activos. No abrí colecciones, nombres ni productos; la siguiente ruta es `newsletters` a las 16:34.

`newsletters` completó su ciclo programado a las 16:34; el historial agregado aumentó de 24 a 25 lecturas. Los agregados del overview (923 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos) y las 410 rutas observadas no cambiaron. La conexión está verificada y el worker sigue activo. No abrí canales ni mensajes. La agenda avanzó a `account_limits` para las 16:49; no se consultarán ni registrarán valores de cuota.

 **Próxima ruta:** comprobar únicamente que `account_limits` complete y que el worker conserve su lease; mantener fuera del informe los valores de cuota.

### Control de frescura de la auditoría — 2026-10-01

La ejecución local de `whapi-field-coverage-cli` toma por defecto la base SQLite local, no la base de producción. El archivo tenía mtime `2026-10-01T01:19:44.695Z`, pero eso no representa la frescura de sus snapshots. Añadí al resumen del CLI el origen lógico de la base y `latest_snapshot_updated_at`; la consulta read-only reporta `2026-09-28T23:43:23.869Z`, unas 68 horas antes de la observación del panel productivo (16:36 hora de Buenos Aires), cuyo snapshot más reciente sí aparecía a las 16:36. El `observed_at` del CLI es solo la hora de generación del informe. Por estas razones excluyo sus conteos de toda afirmación de cobertura actual de producción. Además, “410 campos observados” describe rutas guardadas en WIS; no significa que existan 410 variables de WHAPI ni que el esquema WHAPI esté completo. La siguiente lectura programada es `account_limits` a las 16:49; su resultado se limitará a estado y frescura, sin valores.

Al volver a Inicio, la conexión y el worker seguían activos; contactos subió de 923 a 924 mientras conversaciones (567), mensajes (1.512), grupos (18), tipos guardados (28) y campos listados (410) se mantuvieron. El snapshot más reciente seguía en 16:36, así que el nuevo contacto no se atribuye a una lectura específica ni se examina individualmente.

La lectura programada `account_limits` terminó a las 16:49 y el historial agregado de esa ruta pasó de 20 a 21 ciclos completados. Conexión, worker y 410 campos observados permanecieron sin cambios. No inspeccioné los valores de cuota ni temporizadores. Próxima ruta: `account_username` a las 17:04; su salida se verificará solo por estado y cobertura, sin revelar el nombre.

`account_username` terminó automáticamente a las 17:04 y su historial agregado pasó a 15 ciclos completados. Sin embargo, la ruta `response_verified` sigue en falso; no se verificó una respuesta de username para esta cuenta. El dato permanece desconocido, no se concluye que esté ausente. Conexión, worker y 410 campos observados siguen activos/sin cambio. Próxima ruta: `contact_profiles` a las 17:19, limitada a conteos agregados sin abrir perfiles.

Antes de ese lote, la tabla productiva de cobertura muestra 36 de 924 registros de contacto con `profile_read_at` (aprox. 3,9%). Es una proporción sobre todos los contactos conocidos; algunos no tendrán un perfil consultable, así que no equivale a porcentaje de cobertura elegible. La usaré solo como referencia agregada y no inspeccioné los perfiles asociados.

El lote `contact_profiles` terminó a las 17:19 y su historial subió de 12 a 13 lecturas completadas. El indicador pasó de 36 a 39 registros con `profile_read_at`, mientras contactos subió de 924 a 925. Esto es progreso de consulta, no evidencia de que los tres perfiles contengan todos los campos de WHAPI. Conexión y worker activos; las rutas observadas siguen en 410. Próxima ruta: `group_requests` a las 17:34; revisar solo estado/conteos y no abrir solicitudes.

En el worktree local ajusté `account_username` para consultar en un solo USync las identidades propias PN y LID que expone la sesión y aceptar solamente una respuesta ligada exactamente a uno de esos aliases autenticados; respuestas ajenas o en conflicto siguen sin guardarse. La prueba de regresión cubre una respuesta asociada al LID propio y una respuesta ajena. La suite completa queda en 232/232. Este cambio todavía está en el worktree y no está activo en producción; la lectura de las 17:04 ocurrió con la versión desplegada anterior.

### Lecturas WHAPI pendientes frente a Baileys — 2026-10-01

Al revisar la referencia capturada, encontré 59 métodos con operación exclusivamente `GET`: 53 parciales, cinco pendientes y uno no soportado. No hay un getter de datos inequívocamente seguro entre los cinco pendientes que no tenga ya una ruta automática equivalente: `loginuserrowdata` y `loginuserviaauthcode` son parte del ciclo de vinculación/autorización (la documentación oficial de [Login user with QR-rowdata](https://whapi.readme.io/reference/loginuserrowdata) confirma que `wakeup` es verdadero por defecto y puede lanzar el canal); `getaccountregistrationdate` no tiene un getter público identificado en Baileys, y `findnewsletter`/`recommendednewsletter` tampoco tienen método público identificado. No invoco ni implemento esas rutas como lecturas pasivas sin un contrato seguro verificado. Esto no reduce los 182 métodos del catálogo: explica una brecha concreta de portabilidad y mantiene separado el inventario de la paridad probada.

### Revision y verificacion adicional de username - 2026-10-01

La prueba local conserva casos exitosos PN y LID, incluyendo identidad solo-LID y sufijo de dispositivo; tambien comprueba respuesta ajena, usernames contradictorios y aliases propios que se normalizan al mismo JID. Las respuestas ajenas o contradictorias no se guardan y solo preservan como obsoleto el dato propio previo. La revision independiente de qa_username_aliases acepto el cambio sin defectos bloqueantes. npm test: 232/232; prueba enfocada: 1/1; git diff --check: correcto. Sigue en el worktree y no esta desplegado.

**Proxima ruta:** esperar el turno programado group_requests de las 17:34 hora local; revisar solo estado agregado, conexion y frescura. No abrir solicitudes ni disparar lecturas manuales mientras corre la agenda.


### Resultado programado group_requests - 2026-10-01 17:34

El intento automatico termino failed con el codigo sanitizado provider_error; el contador paso de 6 a 7 fallos de esa ruta. La conexion siguio verificada y el worker activo. El inventario permanece en 410 rutas observadas; no se abrieron solicitudes ni se repitio la lectura manualmente, y no se concluye que una lista este vacia.

**Proxima ruta:** revisar solo estado agregado/frescura del lote programado avatars a las 17:49; no abrir, descargar ni exportar imagenes.


### Resultado programado avatars - 2026-10-01 17:49

El ciclo automatico termino failed con provider_error. La conexion siguio verificada y el worker activo; el inventario permanece en 410 rutas observadas. No se abrieron ni descargaron imagenes, y el resumen no permite inferir si hubo imagenes disponibles.

**Proxima ruta:** observar solo el estado agregado de bot_list a las 18:04; no consultar manualmente el mismo getter si vuelve a fallar.

La ruta automática `bot_list` terminó `failed` a las 18:04 hora local con `provider_error`; el total histórico agregado para esa lectura avanzó a 10. La conexión siguió verificada, el worker activo y el inventario permaneció en 410 campos. El panel pasó a la ruta de temporizador de mensajes para las 18:19. El resultado no identifica la causa de transporte ni se interpreta como lista vacía.

En el worktree reemplacé la consulta IQ manual por el getter de solo lectura `getBotListV2` que Baileys expone y añadí validación de identidad, límites y metadatos. El getter convierte una respuesta sin contenedor de bots en `[]`; por eso una lista vacía ahora queda como respuesta no verificable y no como ausencia confirmada. La alternativa aún no está desplegada y esta ejecución productiva usó el código anterior, así que no atribuyo el fallo a una causa concreta. La revisión independiente aceptó el cierre conservador y el test de regresión. Después del cambio, `npm test` pasó 233/233, `npm run build` (validaciones de sintaxis del proyecto) y `git diff --check` pasaron. El alcance sigue sin probar paridad ni cobertura completa.

**Proxima ruta:** mantener el ciclo automático `disappearing_mode` a las 18:19; no repetir `bot_list` manualmente. Antes de desplegar la alternativa local, terminar la suite y build completos y confirmar la ruta de entrega.

### Despliegue y verificacion del getter de bots - 2026-10-01

El commit `90eb8c6` se desplego correctamente en Easypanel desde la rama configurada. Tras el reinicio, el panel volvio a mostrar la conexion verificada y el worker activo; la persistencia de la sesion se conservo. Luego solicite una unica lectura manual de `bot_list` con el codigo nuevo; termino a las 18:11 con `provider_error`, sin resultado verificable ni codigo mas especifico. El cambio de getter no resolvio por si solo el fallo y no hay evidencia para atribuir una causa. No repito esta ruta ni infiero una lista vacia. Suite completa 233/233, validaciones del proyecto, revision independiente y `git diff --check` pasaron antes del despliegue.

**Proxima ruta:** conservar la agenda existente y esperar `disappearing_mode` a las 18:19. Registrar estado agregado y frescura; dejar `bot_list` como brecha hasta que exista evidencia distinta para diagnosticarla.

El turno automático `disappearing_mode` terminó `done` a las 18:19 hora local. La agenda conserva worker activo y lease vigente; avanzó a `community_subgroups` para las 18:34. No se abrió una conversación ni se forzó una selección de comunidad. El éxito de esta consulta distinta no cambia el estado fallido de `bot_list`.

**Proxima ruta:** observar `community_subgroups` a las 18:34 únicamente a través del scheduler. Si no existe una comunidad conocida elegible, aceptar el resultado `skipped` y continuar la rotación.

### Diagnóstico seguro de bot_list y turno de comunidades - 2026-10-01

EasyPanel desplegó el commit `Expose safe provider status for bot reads` con resultado `Success`. La API de bots y su panel ahora propagan únicamente `status_code` si es un entero HTTP entre 100 y 599; valores de otro tipo se descartan. Las pruebas agregadas confirman que no salen detalles crudos del proveedor. Revisión independiente: PASS (9/9); `npm test`: 233/233; validaciones de sintaxis del proyecto y `git diff --check`: correctos. Tras el deploy, el panel siguió mostrando conexión verificada y worker activo.

El turno `community_subgroups` se omitió de forma segura por `known_community_required`: no había una comunidad conocida elegible. La escritura de snapshot coincidió con las 18:34, pero el resumen visible no permite atribuirla por sí sola a esa ruta. No se forzó una consulta ni se repitió `bot_list`. Su último resultado sigue `provider_error`; el nuevo campo diagnóstico aún no ha sido probado por una lectura nueva, y no hay código de estado que reportar. No se concluye que no existan bots.

**Próxima ruta:** dejar que el scheduler ejecute `account` y `groups` a las 18:50 y revisar solo su estado agregado, frescura y conexión. Luego continuar con `blocklist` según la rotación. El turno `bot_list` queda pendiente de una futura ejecución automática con la instrumentación nueva; no repetirlo manualmente salvo una evidencia operativa distinta. El inventario completo WHAPI todavía tiene brechas y no se declara paridad.

### Resultado programado account y groups - 2026-10-01 18:50

La programación informó `account` y `groups` como `Completada`. La conexión siguió verificada, el worker activo y la agenda avanzó a `blocklist` para las 19:05. La cobertura de producción continúa mostrando 410 campos observados. Esta lectura confirma actualización de esos recursos, pero el agregado no identifica qué rutas nuevas cambiaron y el total de campos no aumentó; no se atribuye ninguna variable WHAPI nueva al turno. `bot_list` conserva sus fallos históricos `provider_error`; aún no hay una nueva ejecución con el código de diagnóstico, por lo que no se informa un status code. No se abrieron conversaciones ni se inició una consulta manual.

**Próxima ruta:** observar el resultado programado `blocklist` a las 19:05, comparar únicamente el total/nombres de campos y la actualidad de la lectura. Luego seguir la siguiente ruta automática distinta; no forzar campos o comandos que la sesión no haya entregado. Mantener pendientes las brechas de WHAPI y no afirmar paridad.

### Cobertura actual y diagnóstico tras lectura única de bot_list - 2026-10-01

El explorador autenticado recalculó la referencia en producción a las 18:54 hora local: 182 funciones, 182 esquemas y 44.628 rutas de respuesta documentadas; 161 tienen observación/equivalencia revisada (14 exactas, 147 semánticas) y 44.467 siguen sin observar. Por función: 23/177 tienen alguna ruta observada y 4 están completas. Estos datos muestran la brecha general, no paridad. El panel principal aún resume 410 campos almacenados/observados localmente, una métrica distinta del total de rutas WHAPI.

Después del despliegue de status codes, solicité una sola lectura `bot_list` desde Mi cuenta. El intento terminó `provider_error`; la tarjeta actualizó su hora de intento pero no mostró `status_code`, así que no había un entero HTTP disponible para diagnosticarlo. No se obtuvieron bots y esto no significa lista vacía. No repetí el intento. La vista general volvió a confirmar sesión conectada/verificada, worker activo y 410 campos; la próxima ruta automática es `blocklist` a las 19:05. No se enviaron mensajes ni se alteraron la conexión o la programación.

**Próxima ruta:** revisar el resultado agregado de `blocklist` una vez venza su turno y luego la ruta siguiente que indique el scheduler. Mantener `bot_list` como brecha sin volver a intentarlo hasta que exista evidencia técnica nueva, y seguir priorizando cobertura de campos frente a las 44.628 rutas documentadas.

El código instalado y fijado del paquete `baileys@7.0.0-rc14` confirma que `getBotListV2` envía un único IQ de lectura `xmlns=bot`, versión `2`, y devuelve entradas de la sección `all`. La lectura de producción de las 18:55 confirmó otra vez `provider_error` sin un status HTTP numérico; no hay base para distinguir entre endpoint no admitido, rechazo remoto u otro fallo. No se añadió una ruta IQ paralela ni se aumentaron los reintentos. Próxima ruta sigue siendo `blocklist` a las 19:05 y después la rotación automática.

### Resultado automático de blocklist - 2026-10-01 19:05

La configuración reportó `blocklist` `done` a las 19:05, con lease de worker vigente; la agenda avanzó a `communities` para las 19:20. El recálculo inmediato del catálogo WHAPI continúa en 161/44.628 rutas (14 exactas, 147 semánticas revisadas, 44.467 sin observar), con 23/177 métodos que tienen alguna observación y cuatro completos. El resumen del panel sigue en 410 campos locales. Por tanto, la lectura de bloqueos no produjo nueva cobertura de rutas WHAPI. Conexión verificada y worker activo; no se abrieron datos de contactos bloqueados ni se emitieron mensajes.

**Próxima ruta:** dejar que el scheduler ejecute `communities` a las 19:20 y comparar el mismo resumen de cobertura, lease y conexión; no iniciar una lectura paralela.

### Resultado automático de communities - 2026-10-01 19:20

La configuración de producción confirmó `communities` `done` a las 19:20, con lease vigente, agenda activa y próximo turno `catalog` a las 19:35. El cálculo del catálogo se actualizó a las 19:20: sigue en 161/44.628 rutas de respuesta observadas o semánticamente revisadas (14 exactas y 147 semánticas); 44.467 siguen sin observar, 23/177 métodos tienen alguna observación y 4 están completos. No cambió la cobertura respecto de `blocklist`; leer comunidades no añadió una ruta WHAPI nueva. La página de conexión informa sesión conectada y pide verificar que la identidad sea la esperada; por separado, el worker continúa activo. No abrí nombres, integrantes ni códigos de invitación, ni inicié otra lectura.

**Próxima ruta:** esperar el turno automático `catalog` de las 19:35 y revisar solo su resultado agregado y la frescura. No repetir manualmente `bot_list` ni el catálogo comercial, que conservan fallos sin diagnóstico concluyente. La paridad con WHAPI sigue incompleta.

### Resultado automático de catalog - 2026-10-01 19:35

El scheduler confirmó `catalog` `failed` con `read_timeout`; el worker permanece activo y el siguiente turno es `collections` a las 19:50. El catálogo WHAPI recalculado a las 19:38 UTC sigue en 161/44.628 rutas (14 exactas, 147 equivalencias revisadas), con 44.467 sin observar y 4 de 177 métodos completamente observados. No se agregó cobertura ni se reintentó el catálogo. Se conserva el timeout como causa observable, sin inferir si falló el proveedor público o el fallback Baileys.

**Próxima ruta:** esperar `collections` a las 19:50 y revisar el estado agregado y la cobertura. Mantener el catálogo comercial en pausa hasta nueva evidencia técnica; no repetirlo manualmente.

### Resultado automático de collections - 2026-10-01 19:50

El scheduler confirmó `collections` `done`, con lease de worker vigente y agenda activa. El resumen WHAPI recalculado a las 19:50 continúa en 161/44.628 rutas observadas/revisadas, 14 exactas y 147 semánticas; 44.467 siguen sin observar, 23/177 métodos tienen alguna observación y 4 están completos. No aumentó la cobertura. La configuración reporta como siguiente `next_kind=newsletters` para las 20:05; el texto visible del panel lo etiqueta como “Canales”, por lo que se comprobará el `last_kind` real del próximo ciclo antes de registrar qué ruta ocurrió.

**Próxima ruta:** esperar el siguiente ciclo de las 20:05 y leer solo `last_kind`, estado y cobertura agregada; no disparar consultas manuales mientras la agenda esté activa.

La verificación posterior confirmó `last_kind=newsletters` y estado `done`; “Canales” era la etiqueta funcional del recurso WhatsApp newsletters, no una lectura distinta. Para quitar la ambigüedad en la vista de programación y en el resumen, ambas etiquetas ahora dicen `Canales (newsletters)`. Revisión independiente: PASS (8/8); `npm test` 234/234, validaciones de build y `git diff --check` correctas. El siguiente turno confirmado por la configuración es `account_limits` a las 20:20.

El commit `ff65155` quedó desplegado manualmente en EasyPanel. La página de producción muestra ya `Canales (newsletters)` para el último `newsletters` completado; la conexión reporta identidad verificada y el worker de lecturas sigue activo. La siguiente ruta configurada es `account_limits` a las 20:20. El cambio solo aclara el nombre visible; no modifica qué se recopila ni crea paridad con WHAPI.

### Resultado automático de account_limits - 2026-10-01 20:20

La configuración reportó `account_limits` `done`, worker activo y lease vigente; siguiente ruta `account_username` a las 20:35. La cobertura de WHAPI se recalculó en 161/44.628 rutas (14 exactas, 147 semánticas), con 44.467 pendientes y cuatro métodos completos. No se observó una ruta de respuesta nueva. `getlimits` continúa descrito como responsabilidad local, porque esos límites locales no equivalen a cuotas del plan WHAPI.

**Próxima ruta:** observar el resultado agregado de `account_username` a las 20:35. No inferir campos de username si WhatsApp no entrega una respuesta correlacionada y verificable.

### Resultado automático de account_username - 2026-10-01 20:35

La configuración confirmó `account_username` `done`, con lease vigente y próxima ruta `contact_profiles` a las 20:50. El catálogo permanece en 161/44.628 rutas de respuesta observadas (14 exactas, 147 semánticas; 44.467 sin observar; 4 métodos completos), por lo que esta ejecución no añadió cobertura WHAPI. No se leyó ni registró ningún valor de username; `done` describe la terminación de la tarea programada y no implica que WhatsApp entregara un campo verificable.

**Próxima ruta:** observar el lote programado de hasta tres perfiles de contactos ya conocidos a las 20:50; revisar únicamente estado y contadores agregados, sin copiar identidades ni contenido personal.

### Resultado automático de contact_profiles - 2026-10-01 20:50

El ciclo de hasta tres perfiles conocidos terminó `done`; el worker conserva lease vigente y la siguiente ruta configurada es `group_requests` a las 21:05. El resumen de campos WHAPI sigue en 161/44.628 rutas (14 exactas y 147 semánticas; 44.467 sin observar, cuatro métodos completos). No se atribuye nueva cobertura al lote y no se registraron identidades, estados ni contenido de contactos.

**Próxima ruta:** observar únicamente el estado agregado del turno `group_requests` a las 21:05. No elegir grupos ni copiar nombres o participantes.

### Resultado automático de group_requests - 2026-10-01 21:05

El turno terminó `failed` con `provider_error`; el worker sigue activo y el lease es vigente. No se muestra un status HTTP u otra causa más específica, así que no atribuyo el fallo a grupo inexistente, permiso o transporte. El total de cobertura WHAPI continúa en 161/44.628 (14 exactas, 147 semánticas; 44.467 sin observar; 4 métodos completos). La ruta siguiente es `avatars` a las 21:20. No se eligió grupo ni se repitió el intento.

**Próxima ruta:** revisar solo el estado agregado del turno `avatars`; no abrir ni descargar imágenes.

### Resultado automático de avatars - 2026-10-01 21:20

La lectura programada `avatars` terminó `done`, con worker activo y lease vigente; no se abrieron ni descargaron imágenes. La cobertura WHAPI continúa en 161/44.628 rutas de respuesta (14 exactas, 147 semánticas y 44.467 sin observar). El próximo turno es `bot_list` a las 21:35; será la primera lectura automática después de desplegar el diagnóstico acotado a códigos HTTP, por lo que se revisará solo si la respuesta ofrece un estado verificable.

**Próxima ruta:** esperar `bot_list` y comprobar estado/código permitido; si vuelve `provider_error` sin código, no repetirlo ni inferir una lista vacía.

### Resultado automático de bot_list - 2026-10-01 21:35

La consulta programada posterior al despliegue terminó `failed` con `provider_error`. La vista de diagnóstico marca `status_code` como no disponible, así que la instrumentación acotada confirma que no hubo un status HTTP utilizable. No se obtuvo una lista verificable ni se puede concluir que esté vacía; no se repitió. Worker activo, lease vigente y próxima ruta `disappearing_mode` a las 21:50. La brecha de bots sigue abierta.

**Próxima ruta:** observar el estado agregado de `disappearing_mode` a las 21:50; no volver a consultar `bot_list` sin evidencia técnica nueva.

### Resultado automático de disappearing_mode - 2026-10-01 21:50

El turno automático `disappearing_mode` terminó `done`; el worker y su lease siguen activos. No hubo nuevas rutas WHAPI observadas: cobertura 161/44.628 (14 exactas, 147 semánticas; 44.467 pendientes; cuatro métodos completos). La configuración avanzó a `community_subgroups` para las 22:05. No se registraron nombres ni contenido de conversaciones.

**Próxima ruta:** comprobar si `community_subgroups` puede ejecutarse con metadatos ya conocidos; aceptar un `skipped` si falta una comunidad elegible y continuar la rotación sin forzar una consulta.

### Resultado automático de community_subgroups - 2026-10-01 22:05

El scheduler omitió de forma segura `community_subgroups` por `known_community_required`; no hizo una lectura sin una comunidad conocida elegible. El worker mantiene lease y la agenda avanzó a `all` a las 22:20. No se eligieron comunidades ni se leyeron identificadores.

**Próxima ruta:** observar `all` a las 22:20 y comparar estado/conteos agregados; mantener la omisión por elegibilidad, sin forzar el objetivo.

### Resultado automático de all - 2026-10-01 22:20

La programación avanzó a `blocklist` a las 22:35; el turno `all` terminó `done` con el worker activo. El catálogo WHAPI sigue en 161/44.628 rutas observadas (14 exactas, 147 semánticas y 44.467 sin observar), 23/177 métodos con alguna observación y 4 completos. La lectura de cuenta y grupos no añadió una nueva ruta de respuesta observada. Se conservaron solo agregados; no se copiaron mensajes, grupos, contactos ni identificadores.

**Próxima ruta:** esperar `blocklist` a las 22:35 y verificar únicamente estado y cobertura agregada.
