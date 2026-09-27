# Consulta de artículos de pedidos

La bandeja permite solicitar manualmente los artículos de un mensaje de pedido recibido y conocido. La operación es de solo lectura y requiere sesión de administrador. La consulta no envía mensajes ni altera el mensaje original.

Baileys `getOrderDetails` requiere `orderId` y `token`. El worker toma ambos exclusivamente del mensaje observado que conserva en su caché de memoria; no los incluye en la cola, SQLite, eventos, logs ni respuesta HTTP. Si el worker reinició o ya no conserva el mensaje, la consulta responde que la credencial temporal no está disponible. No se intenta recuperar el token desde datos persistidos.

La respuesta local guarda hasta 100 artículos, cantidades y valores numéricos/currency tal como fueron informados, la hora de observación y si había imagen disponible. Se descartan las URLs de imagen y se limitan los textos. `GET /api/v1/order-details?message_id=...` solo lee ese resultado guardado; para pedir una actualización, el administrador encola `POST /api/v1/sync` con `kind: "order_details"` y el ID local del mensaje.

La disponibilidad y el esquema de respuesta real todavía requieren validar un pedido compatible recibido en esta cuenta. La función está marcada como parcial en `public/whapi-capabilities.json`; no implica equivalencia de contrato con WHAPI.

Pruebas locales: `local/order-details.test.mjs` y `test/qa/order-details.test.mjs` cubren el paso efímero de la credencial, sanitización, límites, autorización y validación del pedido conocido. No hacen consultas a WhatsApp ni envían mensajes.
