# Campos de etiquetas observadas

2026-10-03, ejecución 01:52 UTC. Ruta 4 alternativa a repetir el catálogo de bots sin respuesta verificable.

Se corrigió el alcance de getlabels: buscaba evidencia `labels`, mientras el worker persiste snapshots `label`. No se cambió simplemente el nombre del alcance porque eso incluiría etiquetas marcadas eliminadas. Se agregó el contexto agregado `active_label`, que excluye tombstones y cuenta solo ID/nombre de tipo texto con contenido no vacío. La comparación usa `[].id` y `[].name`; no asigna nombres CSS a los códigos numéricos de color Baileys ni infiere `[].count` de asociaciones parciales.

Los agregados no devuelven nombres ni IDs de etiquetas. Cada campo conserva su fecha y conteos obsoletos por separado; una etiqueta con nombre vacío más reciente no rejuvenece otro nombre obsoleto. No marcada eliminada no equivale a vigencia actual ni inventario completo.

Owner inicial: 47/47 focales. QA detectó que trim de SQLite no excluye tabulaciones/espacios Unicode; se corrigió mediante iteración sin acumular valores y String.trim de JavaScript, añadiendo casos de tabulación, CRLF, NBSP, em space, BOM y espacio ideográfico. Regresión corregida: 1/1 PASS. El test parte de tombstones únicamente, luego evidencia obsoleta y texto vacío, y confirma ausencia de valores privados en el reporte.

Producción: última implementación sigue siendo 00:39:51 UTC; endpoint connected sin error actual. Chrome abrió Etiquetas y mostró cero filas de tabla y aviso de datos no recopilados, sin leer nombres ni solicitar sincronización. No se espera ni afirma aumento de cobertura productiva mientras no haya evidencia. Cambio local preparado para próximo paquete pertinente, sin nuevo despliegue ni sesión duplicada.

Validación final posterior a la corrección: suite completa 299/299 PASS. QA independiente: 1/1 PASS, hallazgo de espacios Unicode cerrado y sin nuevos hallazgos. `git diff --check` sin errores.

Próxima ruta: revisar asociaciones de etiquetas por mensaje, que no están incluidas en el explorador actual de asociaciones de chat; separar soporte de evento, persistencia y representación API antes de ampliar cobertura. Las brechas WHAPI y recuperación productiva siguen abiertas.
