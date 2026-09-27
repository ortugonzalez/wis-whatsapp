# WIS WhatsApp — revisión independiente QA

Fecha: 2026-09-27. Revisor: qa-ops. Alcance: código local, políticas SQL, API, worker y pruebas sin acceso real a WhatsApp. QA no modificó implementación.

## Dictamen

No quedan hallazgos P1/P2 abiertos en las correcciones revisadas. Apto para continuar validación local con Supabase y vinculación solicitada; este dictamen no certifica funcionamiento en producción, paridad WHAPI ni entrega real de mensajes.

## Hallazgos corregidos y revisados

- **P1 — QR accesible por operadores mediante Supabase:** RLS de conexiones restringida a administradores; RPC de metadatos excluye QR.
- **P1 — archivos entre sectores:** migración `20260927016000_wis_media_isolation.sql` elimina las cuatro políticas permisivas heredadas. Lectura requiere pertenencia al sector resuelto; subida/modificación se restringen a rutas outbound del perfil autenticado; eliminación requiere administrador y pertenencia. Reconoce rutas API, panel, conversaciones y avatares sin conversiones UUID inseguras.
- **P1 — descarga administrativa de archivo ajeno en el worker:** trigger de outbox rechaza rutas de otro sector; `downloadMedia` consulta propiedad otra vez antes de descargar con service role. Cierra la vía de envío a través del panel heredado.
- **P2 — una baja bloqueaba toda la cola:** el claim marca individualmente como fallidas las operaciones cuyo consentimiento se revocó y permite procesar las válidas.
- **P2 — correlación de recibos API:** transacción crea conversación, mensaje y outbox enlazados; idempotencia serializada; operación expone el estado de entrega del mensaje por separado del estado de cola.
- **P2 — webhooks sin recuperación final ni plazo absoluto:** quinto intento interrumpido pasa a failed; entrega aplica plazo absoluto, allowlist de hosts, resolución IPv4 pública fijada y no sigue redirecciones.
- Revisión adicional: comprobaciones de lease antes de mutaciones WhatsApp; historial entregado conserva fecha original, no genera no-leídos y no retrocede la vista previa.

## Evidencia ejecutada por QA

- `rtk node scripts/test-migrations.mjs`: **PASS**, 53 migraciones, seed, regresiones SQL transaccionales, RLS entre dos sectores y rechazo de archivo ajeno en la cola.
- `rtk npm test` en el worker: **PASS**, compilación TypeScript y 4 pruebas de identidad/lease/historial.
- `rtk node --test examples/webhook-dispatcher.test.mjs`: **PASS**, 2 pruebas de destinos internos y firma del cuerpo/fecha.

## Limitaciones pendientes

- PGlite ejecuta PostgreSQL local con esquemas Auth/Storage simulados. No reemplaza pruebas de Supabase Auth, Storage HTTP, PostgREST, Realtime ni Docker.
- La suite de Storage comprueba lectura entre sectores, actualización ajena, prohibición de eliminación por operador, subidas inválidas y válidas, y rechazo de encolado cruzado. No certifica todas las combinaciones administrador/anon, movimientos ni generación de URLs firmadas por el servicio real.
- QR real, reconexión después de reinicio, persistencia de credenciales, recepción, envíos autorizados y recibos de entrega/lectura requieren validación con la línea real. No se ejecutaron en esta revisión.
- No se enviaron mensajes, no se activaron workflows ni se entregaron webhooks externos. Estos ensayos mantienen los límites de aprobación del workspace.
- Las funciones sin soporte verificado de WHAPI deben seguir marcadas como parciales, pendientes o no soportadas. Esta revisión no certifica paridad completa.
- La protección efectiva de credenciales por ACL de Windows y la migración/restauración del entorno necesitan comprobación operativa; los modos POSIX por sí solos no garantizan ACL de Windows.

