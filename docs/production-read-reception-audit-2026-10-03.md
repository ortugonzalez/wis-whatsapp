# Lecturas y recepción — 2026-10-03 09:07 UTC

Frente 1, inspección de producción en Chrome y código local sin cambios operativos.
Worktree inicialmente limpio. EasyPanel conserva el despliegue validado de las
08:55 UTC. No se inició, reinició o duplicó ningún worker; cero procesos locales
Node con comando local/worker.mjs detectados.

## Evidencia nueva

El resumen muestra conectado, identidad verificada, lease vigente, 29 tipos de
snapshots, 443 campos y escritura general 06:05 BA. Los 83 fallos son acumulados,
no 83 fallos activos. La tabla de solicitudes permite atribuir el incremento de
82 a 83 al catálogo de las 05:43 BA: read_timeout. Después figuran all a las 05:55
y collections a las 05:59 como done. Esto prueba finalización de esos comandos,
no necesariamente datos completos ni respuesta no vacía de cada sublectura.

El fallo anterior visible de catálogo fue 2/10 22:56 BA; separación aproximada
6 h 47 min. Es compatible con el enfriamiento de seis horas implementado para
read_timeout. No se atribuye el fallo a desconexión general: la sesión está
conectada y otras rutas finalizaron después. La causa interna del timeout sigue
sin determinarse. bot_list conserva provider_error en intentos 00:57 y 04:13 BA;
el análisis previo documentó falta de respuesta verificable, no una lista vacía.

La tarjeta de conexión muestra: último lote del socket sin observación disponible,
última notificación entrante sin fecha y último lote entrante añadido sin fecha.
Último entrante almacenado sigue 2/10 12:06 BA (14 registros origen live), mientras
último evento es 3/10 05:59 BA. La actividad de lecturas NO demuestra recepción
de mensajes ni permite inferir si hubo mensajes que esta sesión perdió.

## Alternativa y límites

Ante el catálogo bloqueado se contrastó la tabla persistida con el estado del
recolector y con isRecentlyTimedOut/findNextRoute del código, en lugar de repetir
la lectura. No se pulsó Actualizar información ni se encoló consulta alguna.
La siguiente ruta automática visible era newsletters a las 06:14 BA; no se cambió
la programación ni se aseguró su éxito futuro. No hay evidencia nueva que justifique
reintentar manualmente catálogo o bots. No se leyeron mensajes, destinos, QR o secretos.

## Próxima ruta

Frente 4/5: revisar cómo el panel explica fallos históricos frente a últimas lecturas,
y hacer visible el alcance del diagnóstico de recepción sin confundirlo con
conexión. Cualquier mejora debe usar los agregados ya guardados, sin solicitudes
WhatsApp nuevas ni pruebas de envío. Paridad WHAPI y recepción reciente pendientes.

QA documental independiente: PASS contra la evidencia agregada del owner; no fue
una segunda consulta productiva. Sin cambios ejecutables, no se repitieron tests.
