# Tipos y unidades de horarios — 2026-10-03 07:37 UTC

Frente 2. Worktree inicialmente limpio; EasyPanel conserva despliegue del resumen
de fotos. Inventario productivo de cuenta propia: open_time y close_time presentes
en un snapshot, ambos con texto no vacío. Escritura/éxito del snapshot 03:55 BA.
No se leyeron valores de horarios ni se hicieron solicitudes WhatsApp.

## Contrato confirmado

El [OpenAPI oficial](https://panel.whapi.cloud/yaml/openapi.yaml), leído vía HTTP
200 el 3/10/2026, declara openTime y closeTime de tipo number y unidades de minutos
desde medianoche. Sus ejemplos son 540 para 09:00 y 960 para 16:00; son ejemplos
públicos, no horarios de la cuenta. La herramienta web no pudo abrir el YAML;
se obtuvo con una petición pública de Node y se extrajo solo el bloque pertinente.

Baileys instalado 7.0.0-rc14: lib/Socket/chats.js, getBusinessProfile, devuelve
business_config copiando attrs sin conversión. lib/Socket/business.js usa
openTimeInMinutes/closeTimeInMinutes en su ruta de escritura (solo inspeccionada,
nunca ejecutada). Types/index.d.ts declara números, pero el código de lectura
y la evidencia productiva muestran texto. El worker conserva el valor crudo.

## Cambio local y límites

Las notas de equivalencia de apertura/cierre ahora explicitan la unidad y la
diferencia de representación: observación semántica, conversión y validación
numérica pendientes. No se cambia payload, unidad, conteo o frescura; no se afirma
compatibilidad exacta. La corrección de alcance del perfil propio del turno
anterior sigue pendiente de publicar, junto con estas notas.
Pruebas enfocadas 22/22 PASS; revisión independiente qa_ops PASS. Diff sin
errores. Chrome muestra lease vigente y snapshot general 04:35 BA, pero último
entrante origen live sigue con fecha 2/10 12:06 BA. Cero workers Node locales
detectados por comando local/worker.mjs; no se inició otro proceso ni despliegue.

## Próxima ruta

Frente 4: proyección derivada y acotada de minutos, manteniendo atributos crudos.
Aceptar únicamente números finitos o texto decimal inequívoco dentro de límites
de un día; valores vacíos, horarios HH:mm o formatos ambiguos quedan sin derivar.
Probar cero, cierre a medianoche, datos inválidos y snapshots obsoletos, sin
introducir horas/valores que WhatsApp no haya observado. Revisar contrato antes
de contar la proyección como correspondencia numérica. No cambiar cuentas.
