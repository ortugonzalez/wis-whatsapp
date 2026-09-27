# Completar metadatos de mensajes existentes

Los registros históricos pueden conservar texto y tipo sin tener un snapshot del mensaje. La inspección local del 27 de septiembre de 2026 encontró 1438 mensajes en esa situación. No se reconstruyen campos a partir de suposiciones ni se presenta el historial como completo.

Cuando WhatsApp vuelva a entregar un mensaje ya conocido, el worker podrá registrar sus metadatos permitidos si no existe un snapshot anterior y coinciden la conversación, dirección, tipo y texto normalizado. Los mensajes sin conversación identificable quedan excluidos. La recepción repetida no crea otro mensaje, no cambia su texto, estado, archivo ni la vista previa de la conversación. Tampoco dispara descargas o solicitudes de historial.

Se conserva la fecha del registro original y se distingue el momento de observación posterior de los metadatos. Los snapshots existentes y los antecedentes de edición o revocación impiden completar desde una copia que podría estar desactualizada. Esta recuperación depende de lo que WhatsApp vuelva a entregar; no garantiza recuperar los campos de todos los mensajes históricos.
