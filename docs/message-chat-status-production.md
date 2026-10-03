# Correlación y procedencia publicadas — 2026-10-03

EasyPanel confirmó Success para 01c0b12 a las 12:24:22 UTC. Incluye message_chat previamente revisado y las siete notas de estado local precisadas. La implementación de correlación pasó 327/327 pruebas completas; el cambio posterior de explicaciones pasó 36/36 focales y revisión independiente sin hallazgos. No se cambiaron reglas de estado ni se atribuyó played a registros históricos.

Antes de publicar, los filtros de operaciones pendientes y procesando mostraron cero filas. No se solicitaron lecturas de WhatsApp, envíos ni cambios de programación.

Verificación en Chrome:

- chat_id: 1539/1539 mensajes enlazados a chat con identificador no vacío.
- chat_name: 445/1539 mensajes enlazados a chat con título no vacío. Este denominador es por mensaje, no por conversación, y no prueba nombre histórico.
- status: sigue 1539/1539 como estado local; la explicación visible distingue inicialización por dirección, eventos y played reducido a read. No certifica recibo remoto ni enum completo.
- Conexión e identidad verificadas, lease vigente; snapshot 09:24 Buenos Aires. 448 campos inventariados, dos agregados nuevos sin afirmar datos nuevos del proveedor.
- Continúan 84 fallos acumulados y 14 entrantes live con última fecha de mensaje 2026-10-02 12:06 Buenos Aires. Sin recepción reciente verificada.

Captura revisada sin datos personales: `.local/delivery-evidence-production.png`, excluida de Git. Se conserva la pestaña de producción.

Próxima ruta: proyección pasiva de eventos de estado con código y procedencia preservados, probada con socket simulado antes de tocar el worker productivo. No sustituir los valores históricos de delivery_status ni interpretar estados iniciales como recibos nuevos. Siguen abiertas las brechas de estados WHAPI y de recepción reciente.
