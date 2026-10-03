# Auditoría de brechas del perfil propio — 2026-10-03 08:37 UTC

Frentes 2 y 5. Worktree inicialmente limpio. Chrome confirma el despliegue de
minutos validados de las 08:23 UTC, lease vigente y conexión verificada. Snapshot
general 05:33 BA; último entrante almacenado origen live permanece 2/10 12:06 BA.
Cero workers Node locales detectados; no se inició ni reinició ninguno.

## Inventario productivo

El contrato getbusinessprofile muestra 8/12 campos con observación: descripción,
objeto de horarios, zona horaria, día, modo, apertura, cierre e identificador.
Dirección, email, sitios y hours.config aparecen sin observación. Esta enumeración
describe presencia agregada, no valida aún todas las enumeraciones del contrato.
No se extrajeron valores personales. Escritura del snapshot propio: 05:23 BA.

La lista hours.config es una brecha del comparador: sus hijos existen, pero el
alias apuntaba a business_hours.config[], mientras el inventario json_tree lista
el contenedor como business_hours.config y omite nodos objeto de índices numéricos.
No hace falta repetir lecturas de WhatsApp para corregir esta discrepancia.

## Corrección local

El agregado derivado business_minutes ahora acredita hours.config solo cuando
Array.isArray confirma la lista propia. Una lista vacía cuenta como lista presente
sin acreditar ningún minuto. Null, objetos, números o cadenas no cuentan. El alias
conserva equivalencia semántica y explica la diferencia entre lista y elementos.
Se mantienen stale, último éxito, escritura y límite de inspección de 28 filas.

Pruebas enfocadas del autor 5/5 PASS; revisión independiente qa_ops 5/5 PASS sin
hallazgos. La regresión usa el catálogo real y buildDataCoverage, incluye tipos
inválidos, vacío, cero, cierre 1440, obsolescencia, alcance propio y truncamiento.
La primera suite completa detectó una expectativa antigua del alias (316/317);
se corrigió al nuevo contrato sin debilitar la aserción. QA del archivo de aliases
confirmó 21/21 PASS de forma independiente.
Suite completa final rtk npm test: 317/317 PASS (47 segundos).
Este cambio todavía no está desplegado. No se modificó la sesión ni se enviaron
mensajes o solicitudes adicionales a WhatsApp.

## Próxima ruta

Auditar la enumeración de día y modo frente a la referencia, que declara días
abreviados y modos específicos; presencia de texto por sí sola no verifica esos
valores. Completar pruebas de esa validación antes de agrupar y publicar las
correcciones. Dirección/email/sitios continúan sin observación, no se inventarán.
No se declara paridad WHAPI ni recepción reciente.
