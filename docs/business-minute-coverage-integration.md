# Cobertura numérica de horarios — 2026-10-03 08:07 UTC

Frente 4. Worktree inicialmente limpio. Chrome muestra conexión con identidad
verificada, lease vigente, última escritura de snapshot 05:05 BA y último mensaje
entrante almacenado de origen live del 2/10 12:06 BA. EasyPanel mantiene el último
despliegue del resumen de fotos. Estos datos no prueban recepción reciente.
Cero workers locales detectados por su comando; no se inició otro worker.

## Cambio revisado

buildDataCoverage incorpora business_minutes como evidencia contextual derivada
del perfil de negocio propio. Las equivalencias de openTime/closeTime requieren
ahora esa proyección validada; la mera presencia de texto crudo ya no basta.
Se conserva clasificación semántica, nunca equivalencia exacta. Los atributos
originales siguen intactos. La salida agrega conteos, límite de 28 filas y señal
de truncamiento, sin valores de horarios ni identificadores. Último éxito y
escritura del snapshot se informan por separado.

Regresión con catálogo WHAPI real y buildDataCoverage: otros negocios/contactos,
HH:mm, texto vacío y filas fuera del límite no acreditan minutos. Cero y cierre
1440 sí se proyectan. Datos stale siguen clasificados como stale. Se corrigió
durante la prueba el acceso al mapa de respuestas por estado HTTP del catálogo.
Pruebas específicas del autor 5/5 PASS; QA independiente 4/4 PASS, sin hallazgos.
Suite completa rtk npm test: 317/317 PASS (47 segundos).

## Próxima ruta

Verificar la presentación en el dashboard con fixtures y completar la publicación
de este cambio junto con la corrección pendiente del alcance del negocio propio.
No se han desplegado estos cambios ni observado minutos productivos normalizados.
Paridad WHAPI, recepción reciente y recuperación productiva completa pendientes.
