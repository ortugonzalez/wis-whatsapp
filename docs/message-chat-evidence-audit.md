# Chat vinculado a mensajes — 2026-10-03 11:52 UTC

## Observación productiva

EasyPanel mantiene 59f724a, publicado 11:41:05 UTC. Chrome informa conexión e identidad verificadas y lease vigente. Último snapshot 08:51 Buenos Aires; último comando de bloqueos finalizado, próxima ruta comunidades 09:00. Continúan 446 campos inventariados, 84 fallos acumulados y 14 entrantes live con última fecha de mensaje del 2 de octubre a las 12:06. No hay recepción reciente verificada.

## Corrección local revisada

La auditoría anterior identificó que chat_id y chat_name de respuestas de mensajes tomaban evidencia de todas las conversaciones, incluso sin mensaje asociado. Se agregó message_chat: LEFT JOIN desde mensajes a su conversación almacenada y conteos de identificador/título no vacíos por mensaje. Conversaciones ajenas o mensajes huérfanos no acreditan esos campos; dos mensajes del mismo chat aportan dos observaciones, coherentes con el denominador por mensaje.

Get message y ambas listas de mensajes usan ahora este agregado para seis aliases. El título corresponde al valor local disponible y no acredita el nombre histórico del chat al enviarse. No se devuelven valores personales ni se asigna una fecha de observación ficticia. No cambia la base ni se ejecutan lecturas de WhatsApp.

Owner: 47/47 focales y 327/327 suite completa. QA independiente: 1/1 PASS. El fixture SQLite verifica conversaciones ajenas, mensajes sin conversación, títulos vacíos, dos mensajes del mismo chat y ausencia de valores privados en el agregado.

## Pendiente y siguiente ruta

Cambio preparado localmente; producción continúa en 59f724a. Publicar junto con la siguiente corrección pertinente y verificar los nuevos denominadores contra producción. Próximo frente: revisar el significado de delivery_status frente al enum WHAPI y distinguir los valores iniciales que asigna WIS de recibos de entrega realmente observados, sin enviar mensajes ni solicitar nuevas lecturas.
