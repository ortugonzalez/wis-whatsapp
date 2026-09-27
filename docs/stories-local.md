# Estados observados

La vista reúne los estados que WhatsApp entregue a esta sesión. No recupera todos los estados de la cuenta, no publica y no envía confirmaciones de lectura al abrir el detalle local.

Se conserva sólo texto y metadatos permitidos, sin descargar archivos ni guardar claves o enlaces de medios. La ausencia de estados no demuestra que los contactos no hayan publicado: la sesión puede no recibirlos.

La ventana de visualización se limita a 24 horas desde la fecha del mensaje, de acuerdo con la [documentación de WhatsApp](https://faq.whatsapp.com/643144237275579/), consultada el 2026-09-27. Los registros sin fecha válida no adquieren una fecha ficticia. La API debe excluir los caducados aunque el worker no esté ejecutándose; una revocación observada retira el contenido.

Esta función no constituye un archivo histórico de estados. Las pruebas usan fixtures y no provocan publicaciones, visitas ni llamadas reales.

Los backups SQLite existentes son copias del momento de su creación y no se reescriben al vencer un estado. Deben tratarse como datos privados. El vencimiento controla la consulta en la aplicación y la limpieza del contenido en la base activa; no equivale a borrado forense de WAL, disco o backups.

Validación 2026-09-27: 37 pruebas locales y 13 de QA aprobadas, más revisión independiente de API, worker e interfaz. Casos de caducidad, revocación previa a recepción, fechas inválidas y contenido excluido probados con fixtures. Chrome mostró cero estados vigentes; no se provocaron estados reales. La sesión volvió a conectarse tras reiniciar y continuó con cero operaciones salientes. Un detalle abierto revalida su disponibilidad y retira el contenido ante fallo; al volver a una pestaña se comprueba también la caducidad.
