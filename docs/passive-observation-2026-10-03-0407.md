# Seguimiento pasivo posterior al despliegue

2026-10-03, ejecución 04:07 UTC. Rutas 1 y 5, sin cambios de producción.

Chrome/EasyPanel conserva la implementación del diagnóstico. La conexión aparece verificada y el worker mantiene lease vigente. El último lote del socket permanece sin observación; las marcas notify/append entrantes tampoco tienen fecha. Se observan escrituras de snapshots hasta las 01:04 de Buenos Aires, pero no prueban recepción de mensajes. El último evento continúa a las 00:54 y el mensaje entrante almacenado conserva su fecha anterior.

La evidencia nueva permite atribuir el incremento de 80 a 81 fallos registrados a `bot_list`: ahora 23 fallos provider_error, último a las 00:57 de Buenos Aires. El catálogo mantiene 30 fallos totales, con último timeout a las 22:58 del día anterior. Son lecturas de datos adicionales, no una prueba de falla de mensajería. No se ejecutó ninguna consulta remota manual para intentar recuperarlas.

Revisión de código del recolector: `isRecentlyTimedOut` consulta el último comando por tipo y aplica seis horas de espera únicamente a `read_timeout`. Un `provider_error` no activa esa espera. La secuencia contiene 14 rutas y avanza cada intervalo configurado; esto explica que el recolector pueda volver a intentar bots después de otras rutas, sin que el heartbeat lo haya solicitado. No identifica por sí solo la causa del error del proveedor ni garantiza tiempos exactos, porque hay guardas de conexión, lease y lecturas activas.

No se cambió esa política ni se activaron/desactivaron rutas. El alcance actual prohíbe modificar agendas o flags productivos. Antes de proponer otro intento de bots, corresponde una alternativa técnica verificable o una política explícita para errores persistentes. Repetir el mismo getter no aporta evidencia suficiente.

QA documental independiente: PASS, descripción contrastada con el scheduler y evidencia agregada aportada; sin nuevas consultas ni modificaciones. Diff sin errores. No se ejecutaron pruebas de código porque no hubo cambios funcionales.

Próxima ruta independiente: auditar campos de contactos/perfiles ya recopilados contra WHAPI y elegir un dato útil faltante que no dependa de bots ni catálogo. Mantener el diagnóstico de lotes pasivo. Sin tráfico observado no se puede distinguir inactividad real de ausencia de eventos; no pedir otro QR ni provocar envíos.
