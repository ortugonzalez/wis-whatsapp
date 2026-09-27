# Entrega SQLite · 27/09/2026

## Estado verificado

- Servidor local y worker funcionando en `127.0.0.1:3010`, sin conexiones a Supabase ni dependencia de Docker.
- Login administrativo probado en Chrome del usuario.
- QR real generado por Baileys y visible en Chrome; no registrado en Git ni en informes.
- Vinculación realizada por el usuario. Identidad completa cotejada con la línea terminada en 5679 y guardada; coincidencia verificada.
- Reinicio real del servidor y worker comprobado: recupera la sesión sin solicitar QR.
- Recolección real al reiniciar: 436 contactos, 457 conversaciones, 1.438 mensajes y 18 grupos al momento de la comprobación. Las cifras evolucionan con la sincronización.
- Perfil, estado, privacidad y disponibilidad de perfil comercial consultados. Los valores no expuestos por WhatsApp se distinguen de los disponibles.
- Dashboard actualizado y verificado en Chrome, con búsqueda/paginación, multimedia privada, grupos, actividad, preferencias editables y catálogo de campos de los 182 métodos de WHAPI.
- SQLite protegido por ACL local; backup consistente ejecutado.
- API local, consentimiento/bajas, scopes, revocación, idempotencia, cola y webhooks con entregas desactivadas.
- Campañas permanecen desactivadas; no se enviaron mensajes.
- Ejemplos Python y n8n apuntan a API HTTP, no a archivos de sesión.

## Validación

`npm run build`, 12 pruebas locales y de QA en la ampliación, y revisión independiente. Ver `ops/reports/qa/wis-sqlite-review.md`. El reinicio con cuenta vinculada ya fue probado. Las pruebas de WhatsApp real de envío y multimedia saliente requieren aprobar los envíos concretos.

## Límites actuales

El runtime SQLite inicial administra un usuario administrador y una conexión. No implementa todavía usuarios operadores ni múltiples conexiones. La bandeja consulta el historial disponible; no hay garantía de historial completo. No se declara paridad WHAPI: administración avanzada de grupos, canales, comunidades, catálogo Business, estados publicados y llamadas permanecen pendientes donde lo indica la matriz. Los esquemas de variables WHAPI son referencia, no prueba de implementación. La ejecución de campañas no está implementada. No se habilitaron webhooks externos ni workflows.

El código heredado de Next/Supabase se conserva como referencia en su historial y carpetas, pero no forma parte del arranque activo. El manual vigente es `docs/sqlite-local.md`.
