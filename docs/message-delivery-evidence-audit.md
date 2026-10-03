# Evidencia de entrega — 2026-10-03 12:07 UTC

## Estado real

EasyPanel mantiene 59f724a. Chrome: conectado, identidad verificada, lease vigente; último snapshot 09:02 Buenos Aires. Comunidades terminó el comando de las 09:00; siguiente ruta indicada: colecciones a las 09:15. Se mantienen 446 campos, 84 fallos y 14 entrantes live; último mensaje del 2 de octubre a las 12:06. No hay nueva recepción verificada. La programación se leyó sin cambiarla ni solicitar una lectura manual.

Get message.status aparece respaldado por messages.delivery_status en 1539/1539 filas, sin fecha de snapshot. Ese conteo acredita disponibilidad de una columna local, no 1539 recibos de entrega observados.

## Diferencias verificadas en código y catálogo

- La ingestión inicial asigna sent a salientes y delivered a entrantes según fromMe. Es una interpretación local del mensaje recibido, no necesariamente un evento de confirmación remoto independiente.
- messages.update transforma códigos 2/3/4/5 en sent/delivered/read/read. Por tanto pierde la distinción de played en esa columna.
- message-receipt.update conserva receiptTimestamp/readTimestamp/playedTimestamp en snapshots de recibos; ese camino no actualiza directamente delivery_status.
- La revocación borra cuerpo/medio, pero no convierte por ese camino la columna en deleted.
- El enum del catálogo local WHAPI contiene failed/pending/sent/delivered/read/played/deleted. La columna actual no demuestra el contrato completo ni la procedencia de cada estado.

No se concluye que el estado mostrado sea falso: su procedencia y alcance son distintos de un recibo remoto explícito. La equivalencia actual debe interpretarse como disponibilidad de estado local, no compatibilidad total.

Prueba focal existente de persistencia de quotes/mentions/reactions/receipts/edits/revokes: 1/1 PASS, con socket simulado y sin envíos. No valida recepción actual ni todos los enums de estado.

QA independiente confirmó el hallazgo y repitió la prueba focal: 1/1 PASS. Como corrección mínima previa a la proyección, recomienda precisar las siete notas de aliases de estado para explicitar normalización local, inicialización por dirección y pérdida de played. No se realizaron cambios en producción.

## Próxima ruta

Diseñar una proyección pasiva separada de evidencia de estado, preservando código original, clase de evento y hora observada; no reescribir estados históricos ni inferir recibos faltantes. Probar independencia entre estado inicial y evento de proveedor, además de played y revocación. Mantener pendiente la publicación de message_chat hasta el siguiente conjunto pertinente. No reintentar bots/catalog ni modificar el programador por este hallazgo.
