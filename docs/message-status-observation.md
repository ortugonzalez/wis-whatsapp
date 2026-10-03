# Evidencia pasiva de estados de mensaje

3 de octubre de 2026. La columna `messages.delivery_status` existía antes de esta entrega. Puede comenzar como `sent`/`delivered` por dirección y el worker normaliza `messages.update` código 5 (`PLAYED`) a `read`. Por eso no se interpreta esa columna como recibo remoto completo ni como paridad WHAPI.

Para mensajes ya almacenados, el worker conserva desde ahora una secuencia acotada de hasta 20 señales `baileys.messages.update`, cada una con código original 2/3/4/5, interpretación (`sent`/`delivered`/`read`/`played`) y hora local de observación. El código 5 se verificó contra el enum `proto.WebMessageInfo.Status.PLAYED` de Baileys 7.0.0-rc14 instalado. El snapshot no contiene cuerpo, destinatario ni identificadores en el payload; su clave interna corresponde al ID de mensaje. No se rehacen estados antiguos ni se infiere evidencia para filas sin evento.

`GET /api/v1/messages?id=...` proyecta únicamente los campos permitidos como `delivery_observation`, o `null` si no hay señal válida. La ficha del mensaje distingue esta observación del estado local y explica que la secuencia es incompleta. Los recibos por participante existentes siguen en su sección independiente; este cambio no los fusiona ni modifica el estado local ni las operaciones.

Pruebas focales de proyección, API, UI y worker: aprobadas. Suite completa: 333/333. Revisión independiente: PASS sin bloqueantes; verificó enum instalado, alcance a mensajes conocidos, allowlist y separación entre estado local y evento. Su validación fue sintética/estática, no una observación productiva. No se hicieron envíos, lecturas manuales, cambios de configuración de WhatsApp, QR ni rotaciones de credenciales.

Próxima ruta: contrastar en producción una señal futura de estado cuando llegue naturalmente, con fecha y código, sin fabricar una confirmación. Auditar luego `receiptTimestamp`, `readTimestamp` y `playedTimestamp` por participante contra el catálogo WHAPI. La ausencia de eventos anteriores debe seguir visible como desconocida.
