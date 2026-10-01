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
