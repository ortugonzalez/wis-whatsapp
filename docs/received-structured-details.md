# Detalles de mensajes recibidos

El drawer de mensaje presenta campos permitidos de ubicación, tarjetas de contacto, encuestas, respuestas a botones/listas y referencias a votos cifrados. La ubicación distingue estática/en vivo únicamente cuando ese dato existe; los registros antiguos permanecen desconocidos. Las vCards aparecen plegadas como texto escapado, sin enlaces, importación ni acciones externas. Una actualización cifrada de encuesta no revela opciones elegidas, votantes ni resultados.

Imagen, audio, video, documento y sticker muestran sus metadatos ya guardados: MIME, nombre, duración, nota de voz, dimensiones y páginas. La sección no descarga ni analiza archivos; un campo ausente no se estima. Revocados y eliminados ocultan los detalles. Se conservan las secciones previas de citas y reacciones.

Las pruebas aisladas usan fixtures y verifican escaping, campos permitidos, ceros/false, ausencias, revocación y ausencia de enlaces o cargas multimedia. No consultan WhatsApp. La inspección del responsable del incremento encontró 18 audios, 17 imágenes, 6 documentos y 2 stickers, pero sin snapshots de metadatos asociados: esos campos reales deben figurar como «No informado». Los campos poblados y los otros tipos se validan con fixtures, no con recepción real en esta cuenta. No se recuperan ni inventan metadatos de los archivos.

Verificación en Chrome del 27 de septiembre de 2026: filtro Audio, apertura del detalle de un mensaje real y sección «Metadatos de audio» con sus siete campos «No informado». La normalización de nuevas recepciones admite sólo campos propios del mensaje y valores del tipo esperado; conserva cero y falso explícitos. Las tarjetas y opciones se limitan a 100 elementos. Los envíos de estos tipos especiales siguen rechazados por la API.
