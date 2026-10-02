# Límite de descarga multimedia en recepción

2026-10-02. Ruta de persistencia y disponibilidad del dashboard.

La cola de mensajes esperaba downloadMediaMessage sin límite total local. Una promesa que nunca terminara impedía guardar los mensajes siguientes. Ahora la espera vence a los 15 segundos y solicita cancelación mediante AbortSignal en options.options, propagado por la versión instalada de Baileys al transporte HTTP. stop también cancela la espera.

Si el transporte ignora cancelación, se conserva una única solicitud pendiente y no se inicia otra hasta que termine. La cola continúa guardando mensajes y metadatos sin archivo. La respuesta tardía no escribe un archivo. No se reintenta ni se solicita reupload. El historial importado conserva su política de no descargar multimedia.

Prueba con worker y SQLite en memoria: imagen bloqueada, segunda imagen y texto posterior terminan guardados; una sola descarga subyacente; sin archivo después de la respuesta tardía. Pruebas del limitador cubren timeout, bloqueo de concurrencia, recuperación al terminar y stop. Suite completa 287/287; focal ampliada 4/4 incluye éxito normal y rechazo tardío después de stop. QA independiente PASS sobre runtime y 3 pruebas iniciales. No se reprodujo el bloqueo con datos o tráfico real.

Límite operativo: mientras una descarga subyacente siga sin terminar se omiten archivos nuevos, pero continúa la información textual. No garantiza recuperación de archivos omitidos ni corrige otros posibles bloqueos de red. No cambia el límite existente de tamaño de archivo: los 25 MiB se comprueban después de descargar y no limitan memoria en tránsito.

Producción: EasyPanel Success 2026-10-02 23:12:21 UTC. Cola sin operaciones pendientes ni procesándose antes de publicar. No se envió multimedia real para forzar el fallo; su reproducción sigue siendo sintética. Panel recargado después del despliegue.

Próxima ruta: registrar resultados agregados de descarga para diferenciar ausencia de multimedia de una cola de recepción detenida, sin registrar URLs ni claves de cifrado; evaluar límite durante streaming para reducir memoria en tránsito.
