# Entrega SQLite · 27/09/2026

## Estado verificado

- Servidor local y worker funcionando en `127.0.0.1:3010`, sin conexiones a Supabase ni dependencia de Docker.
- Login administrativo probado en Chrome del usuario.
- QR real generado por Baileys y visible en Chrome; no registrado en Git ni en informes.
- Vinculación del teléfono e identidad completa pendientes del escaneo del usuario.
- SQLite protegido por ACL local; backup consistente ejecutado.
- API local, consentimiento/bajas, scopes, revocación, idempotencia, cola y webhooks con entregas desactivadas.
- Campañas permanecen desactivadas; no se enviaron mensajes.
- Ejemplos Python y n8n apuntan a API HTTP, no a archivos de sesión.

## Validación

`npm run build`, pruebas locales de backend/worker y revisión independiente de QA. Ver `ops/reports/qa/wis-sqlite-review.md`. Las pruebas de WhatsApp real de envío, reinicio con cuenta vinculada y multimedia requieren vincular primero la cuenta y aprobar los envíos concretos.

## Límites actuales

El runtime SQLite inicial administra un usuario administrador y una conexión. No implementa todavía usuarios operadores ni múltiples conexiones. La bandeja consulta el historial disponible; no hay garantía de historial completo. No se declara paridad WHAPI: grupos avanzados, canales, comunidades, catálogo Business, estados y llamadas permanecen pendientes donde lo indica la matriz. La ejecución de campañas no está implementada. No se habilitaron webhooks externos ni workflows.

El código heredado de Next/Supabase se conserva como referencia en su historial y carpetas, pero no forma parte del arranque activo. El manual vigente es `docs/sqlite-local.md`.
