# Último lote del socket en API y panel

2026-10-03, ejecución 03:37 UTC. Ruta 4: exposición del diagnóstico pasivo preparado previamente.

GET `/api/v1/overview` incorpora `last_upsert_activity`, nulo si no existe evidencia válida. Se valida JSON, fuente, enum de tipo, fecha, enteros no negativos, suma de direcciones y límite de sobres sin contenido. Se proyectan únicamente fecha y conteos permitidos. Campos adicionales del snapshot no salen en la respuesta. El mismo permiso de lectura existente protege el resumen.

La vista general muestra último lote, tipo, cantidad de sobres, distribución entrantes/salientes/desconocidos y cantidad sin contenido. Declara que no son acumulados, pueden incluir ecos o repeticiones y no prueban unicidad ni guardado. La marca entrante notify/append continúa separada. Sin evidencia se indica explícitamente ausencia de observación desde esta versión.

Producción inspeccionada en Chrome: continúa la implementación del selector, conexión verificada, lease vigente y recolector dentro del intervalo; última escritura agregada 00:34 de Buenos Aires, 79 fallos históricos y sin cambios en el último mensaje entrante almacenado. No se infiere recepción de las escrituras de snapshots. Esta ampliación todavía no fue desplegada ni se reinició el worker.

Validación focal owner: 10/10 pruebas de API, sanitización y renderizado simulado. QA detectó desplazamiento de la directiva use strict; se corrigió y se agregó su comprobación. El harness de indicadores de envío ahora carga el helper real. QA final 2/2 PASS, sin hallazgos pendientes. Se documentó el contrato OpenAPI. No hubo lectura ni almacenamiento de contenido personal en el informe.

Suite completa final: 302/302 PASS; diff sin errores de formato.

Próxima ruta: desplegar el paquete revisado con el observador, resumen y corrección textual de cobertura; comprobar estado, ausencia inicial de observación y luego evidencia pasiva real. No enviar mensajes para provocar actividad. Si no llega ningún lote, conservar la incertidumbre en lugar de diagnosticar una desconexión inventada.
