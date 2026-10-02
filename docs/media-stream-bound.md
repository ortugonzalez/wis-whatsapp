# Descarga multimedia por streaming limitado

2026-10-02. Continúa la protección de la cola de recepción.

El worker pide a Baileys un stream, no un buffer completo. El colector rechaza y destruye el stream cuando el siguiente fragmento supera el máximo de 25 MiB acumulados. Cancela también streams detenidos o que llegan después de cancelar la solicitud. No devuelve archivos parciales tras error.

El límite se aplica a bytes retenidos por el colector, no es una garantía de memoria total del proceso: transporte, descifrado, fragmento entrante y concatenación final tienen memoria adicional. Se mantiene la exclusión de una descarga subyacente y el límite de espera de 15 segundos.

Validación focal 7/7: exacto y exceso de tamaño, cancelación inmediata/tardía, error de stream, tipo inválido; worker simulado conserva texto tras timeout, ignora archivo tardío y guarda bytes correctos de una descarga posterior exitosa. Sin tráfico o sesión real de prueba.

Estado previo Chrome: conectado, 967 contactos, 568 conversaciones, 1539 mensajes, 18 grupos. Conteos no demuestran recepción reciente. Suite completa 291/291. QA independiente PASS, 7/7 focales. Despliegue pendiente de registrar.

Próxima ruta: observabilidad agregada de descargas omitidas/fallidas/guardadas, sin URLs ni claves ni contenido personal.
