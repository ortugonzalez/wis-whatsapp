# Comparación de campos de checkhealth

2026-10-03, ejecución 00:21 UTC. Ruta 4 tras la auditoría agregada anterior.

El catálogo conservado de WHAPI 1.8.7 documenta 22 rutas de respuesta para `checkhealth`. El evento `connection.update` de Baileys que WIS conserva contiene únicamente `connection`, `isOnline`, `receivedPendingNotifications` e `isNewLogin`; ninguno tiene una equivalencia validada con los códigos WHAPI. Por eso el estado local conectado no se convierte en `status.code` ni `status.text` de WHAPI.

Se añadieron dos correspondencias semánticas de datos ya persistidos: `user.name` desde `profile.name` y `user.pushname` desde `profile.notify`. Usan el perfil propio que el worker guarda al abrir la sesión, no perfiles de contactos. Exigen texto no vacío. Conservan la evidencia y marca obsoleta del snapshot; no verifican salud actual, recepción, disponibilidad de envíos ni conexión oficial Meta.

No se mapean `channel_id`, `start_at`, `uptime`, versiones, dispositivo, IP, estados/códigos, teléfono, identificadores, imágenes, tipo Business, libreta ni contacto guardado. Requieren revisión independiente de semántica, representación o disponibilidad antes de considerarlos equivalentes. Los campos contenedores tampoco se dan por observados automáticamente por tener un nombre hijo.

Pruebas focales: 36/36 PASS. La regresión usa el catálogo real y evidencia sintética sin valores personales: solo conexión y contactos dan cero correspondencias; dos nombres propios dan dos rutas semánticas y veinte no observadas; nombres vacíos dan cero; los nombres marcados obsoletos no se cuentan como evidencia sin marca obsoleta.

Estado productivo observado en Chrome: sigue desplegada la versión de resultados multimedia de 23:44:20 UTC. La matriz todavía informa 188 rutas observadas; este cambio local no se cuenta como producción. Endpoint productivo connected, error actual nulo. Sin nuevos envíos, consultas a WhatsApp ni reinicios. No se despliega por separado este ajuste de comparación: queda preparado para el próximo paquete revisado para evitar un reinicio aislado del worker.

Validación final: suite completa 294/294 PASS. QA independiente PASS; ejecutó 1/1 regresión y revisó origen propio, semántica y tratamiento de evidencia obsoleta. No modificó archivos ni consultó producción.

Próxima ruta: analizar datos de proceso/lease ya disponibles y frescura por recurso; incorporar este cambio al próximo despliegue pertinente y verificar el incremento real solo si el perfil productivo contiene esos nombres. No asumir que los fixtures prueban presencia de campos productivos ni paridad WHAPI.
