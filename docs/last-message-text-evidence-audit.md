# Texto del último mensaje — 2026-10-03 11:37 UTC

## Resultado local

Se completó el alcance pendiente de message-text-evidence-audit.md. La cobertura de chats y grupos calcula text_body solo después de seleccionar su mensaje más reciente, y únicamente cuando ese mensaje tiene tipo text y cuerpo no vacío. No busca un texto anterior para sustituir un caption, cuerpo vacío o null. Los cuerpos originales permanecen sin cambios; sólo salen conteos agregados.

Las cuatro equivalencias last_message.text.body (getchat/getchats/getgroup/getgroups) requieren el agregado nuevo. La evidencia no recibe una fecha inventada. Se conserva el conteo bruto body para inventario de almacenamiento, separado de su equivalencia con texto WHAPI.

Owner: 48/48 pruebas focales. QA independiente: 1/1 PASS sin hallazgos. Los fixtures conservan texto anterior y alternan el último mensaje entre imagen con caption, whitespace, null y texto válido. El caso null prueba ausencia de cuerpo, no el flujo completo de revocación del proveedor. No se consultaron conversaciones ni contenidos privados productivos.

## Estado productivo previo

Despliegue 2bf6740, conectado con identidad verificada y lease vigente. Snapshot más reciente 08:36 Buenos Aires; cuenta y grupos terminó el comando encolado 08:30. Próxima ruta indicada: bloqueos 08:45. Persisten 84 fallos acumulados y 14 entrantes live; última fecha de mensaje 2026-10-02 12:06 Buenos Aires. No se verificó nueva recepción.

## Próxima ruta

Publicar el conjunto de evidencia de texto tras la suite completa. Verificar conteos agregados productivos y continuidad de sesión, sin lecturas nuevas de WhatsApp. Después limitar chat_id/chat_name de mensajes a conversaciones enlazadas; esa brecha identificada permanece pendiente.
