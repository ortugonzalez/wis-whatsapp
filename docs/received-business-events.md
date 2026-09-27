# Productos, pedidos y eventos recibidos

El worker reconoce estos contenidos cuando WhatsApp los entrega a la sesión. Guarda solo campos permitidos del esquema de la versión instalada de Baileys. No realiza consultas comerciales adicionales ni confirma pedidos o asistencia.

Los importes del protocolo se conservan como enteros decimales exactos, con el nombre de escala `Amount1000`; no se convierten a números JavaScript que puedan perder precisión. Los campos ausentes siguen ausentes: no se reemplazan por ceros ni por el estado predeterminado de protobuf.

Se excluyen tokens de pedidos, claves y direcciones de multimedia, miniaturas, URLs firmadas y enlaces para unirse a eventos. Los mensajes de visualización única mantienen sus controles anteriores. La API de envío conserva sus tipos habilitados previos; reconocer un tipo entrante no autoriza enviarlo.

El detalle en el panel presenta la información recibida y su alcance. Los mensajes revocados no muestran de nuevo esos detalles. No se deducen compras realizadas, pagos, disponibilidad de productos ni aceptación de invitaciones a partir de un mensaje.

La comprobación inicial de la base real no encontró sobres previamente registrados de estos tipos. Las pruebas son fixtures aislados; no se fabricaron mensajes ni se reescribió el historial para simular recepción. La observación real queda pendiente de que la cuenta reciba uno de estos contenidos.

También se conservan respuestas a eventos con el código informado, la marca temporal y el número de invitados cuando estén presentes, sin inferir el evento relacionado. Buscar mensajes permite combinar texto y tipo mediante `GET /api/v1/messages?type=order` (o `product`, `event`, `event_response`). Los cuatro tipos se rechazan en la API de envío.

Validación: 43 pruebas locales aprobadas, pruebas de permisos y tipos de API aprobadas, y revisión independiente. Chrome mostró los nuevos filtros y cero coincidencias al seleccionar pedidos en la base real; esto verifica el filtro, no una recepción real de pedidos.
