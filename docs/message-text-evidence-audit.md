# Evidencia de texto de mensajes — 2026-10-03 11:22 UTC

## Producción observada

Despliegue 2bf6740, conectado con identidad verificada y lease vigente. Último snapshot 08:16 Buenos Aires; 84 fallos acumulados, 29 tipos y 443 campos. Último comando mostrado: temporizador de mensajes finalizado; próxima ruta indicada: cuenta y grupos a las 08:30. Los 14 entrantes live mantienen como última fecha de mensaje el 2 de octubre a las 12:06: no hay nueva recepción verificada.

Get message muestra 17/722 rutas observadas, 17 sin marca obsoleta y 705 sin observar. Campos generales de mensajes presentan 1539/1539 registros, incluidos body, direction, type, created_at y delivery_status, sin fecha de snapshot disponible. Los chats asociados se cuentan actualmente desde conversaciones: 568 IDs y 27 títulos sobre 568. Estos conteos no demuestran una respuesta completa por mensaje.

En imágenes, MIME/ancho/alto aparecen en 17/17 snapshots con fecha 30 de septiembre a las 09:57 Buenos Aires. Captions de imagen y los campos revisados de vídeo no tienen observación en la tabla consultada. No se abrieron cuerpos, nombres, identificadores ni archivos privados.

## Hallazgo y corrección local

El conteo general usa count(body): incluye valores vacíos. Además, normalizeContent conserva captions, nombres de archivos y etiquetas locales en body para tipos distintos de text. Por tanto, la mera existencia de esa columna no acredita text.body de WHAPI.

Se agregó stored_text_message, calculado sobre SQLite existente, con conteos del tipo text y texto no vacío tras trim. No devuelve cuerpos ni asigna una fecha de observación falsa. Los aliases de getmessage, getmessages y getmessagesbychatid ahora requieren ese agregado. El dato bruto y los mensajes originales se conservan; no se solicita historia ni se ejecuta una lectura de WhatsApp.

Owner: 47/47 focales y 325/325 suite completa. QA independiente: 1/1 PASS, sin hallazgos. Pruebas con SQLite sintético cubren captions, etiquetas, vacío, whitespace, null y texto válido, además de la imposibilidad de recurrir al body genérico como evidencia alternativa.

## Alcance pendiente

No se publicó este cambio en esta vuelta. Los aliases last_message.text.body de chats/grupos todavía requieren la misma revisión por tipo y contenido; conviene resolver y revisar ese alcance relacionado antes de publicar el conjunto. También queda pendiente limitar chat_id/chat_name de mensajes a conversaciones efectivamente enlazadas a mensajes, en lugar de todos los chats existentes. No se declara paridad ni frescura a partir de los conteos actuales.

Próxima ruta: aplicar la evidencia de texto al último mensaje de chats y grupos, manteniendo su selección por mensaje más reciente, y comprobar con casos donde el último mensaje sea imagen, texto vacío o mensaje eliminado. Después ejecutar pruebas y QA antes del despliegue conjunto.
