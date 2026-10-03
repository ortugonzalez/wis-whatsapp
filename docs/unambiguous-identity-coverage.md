# Cobertura de pares PN/LID sin conflictos

2026-10-03, ejecución 05:07 UTC. Ruta 2/4, cierre de la brecha identificada en la auditoría anterior.

Producción inspeccionada en Chrome: sigue el despliegue de diagnóstico, conexión verificada, lease vigente, 81 fallos históricos y escrituras de snapshots hasta las 02:04 de Buenos Aires. Esto no demuestra recepción de mensajes. No se consultaron ni expusieron identificadores.

Se agregó el contexto agregado `unambiguous_identity`: valida LID, PN, correspondencia con resource_id, fuente conocida, estado observed y conflict=false. Reúne los PN candidatos de cada LID antes de aceptar pares, para excluir colisiones incluso con candidatos de filas ya marcadas conflictivas. Requiere un solo candidato y un solo LID propietario de ese candidato. JSON inválido o pares incompletos no acreditan campos. Solo devuelve conteos y fechas, nunca valores.

Las equivalencias getlidbyid/getidbylid usan ahora este contexto tanto para coincidencias exactas como semánticas. Los snapshots identity sin filtrar no pueden volver a acreditar esas rutas por coincidencia literal. El explorador de identidades y la evidencia histórica de conflictos no se alteran. Un par no conflictivo observado no prueba vigencia actual: se conservan fecha y marca de obsolescencia.

Prueba aislada con SQLite en memoria y referencia WHAPI guardada: conflicto explícito, dos LID con mismo PN, colisión con candidato secundario, fuente desconocida, PN inválido, privacidad, bloqueo de coincidencia raw y evidencia válida obsoleta. Un error inicial del test al nombrar el total se corrigió para sumar las métricas reales exacta/semántica.

Validación: suite completa 305/305 PASS y QA independiente 1/1 PASS. La observación menor de memoria se atendió conservando solo los campos necesarios por fila, sin payloads completos ni conjuntos duplicados de candidatos; pruebas posteriores del agregado y cobertura 26/26 PASS. Diff sin errores. Sigue pendiente de despliegue.

Próxima ruta: desplegar con las correcciones pendientes de nombres tras completar QA y suite; comparar cobertura productiva sin inferir cantidades de conflictos de la mera presencia del campo booleano. Mantener recepción bajo observación pasiva y no modificar identidades ni permisos.
