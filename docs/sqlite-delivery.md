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
- Ampliación con detalles legibles de contactos y participantes, exploradores Business, etiquetas, comunidades y canales. Los comandos de comunidades y canales conocidos finalizaron; una revisión posterior encontró que algunos parsers de Baileys pueden convertir la falta de respuesta en una lista vacía. Por ello la finalización de un comando no se utiliza como prueba de colección completa sin validar la respuesta del protocolo. Catálogo y colecciones devolvieron fallo de lectura; se conserva esa limitación explícita y se añadieron diagnósticos sanitizados y eventos de resultados tardíos.
- Apagado real por `npm run local:stop` comprobado: salida correcta, lease liberado y bloqueo del supervisor retirado. Reconexión posterior sin QR.
- Verificación real posterior a los adaptadores comprobados: grupos, comunidades y bloqueados tienen `response_verified: true` y disponibilidad confirmada. El catálogo continúa con `read_timeout`; no se declara catálogo vacío ni paridad de esa función. Colecciones permanece pendiente de una lectura válida.
- SQLite protegido por ACL local; backup consistente ejecutado.
- API local, consentimiento/bajas, scopes, revocación, idempotencia, cola y webhooks con entregas desactivadas.
- Campañas permanecen desactivadas; no se enviaron mensajes.
- Ejemplos Python y n8n apuntan a API HTTP, no a archivos de sesión.
- Detalle de mensajes con citas, menciones, reacciones y recibos disponibles; búsqueda global en SQLite y biblioteca multimedia autenticada. Comprobado en Chrome: 1.438 registros, filtro sin coincidencias, apertura de detalle y biblioteca sin archivos locales registrados. La consulta de historial anterior diferencia solicitud de llegada correlacionada y no promete recuperación completa.
- Alternativa posterior para Business: ruta pública GraphQL integrada y verificada desde Chrome. Colecciones devolvió una respuesta real vacía, registrada con alcance público parcial. Catálogo respondió `2498052`, registrado como `public_catalog_unavailable`; no se afirma catálogo vacío. Se reemplazó la consulta IQ que terminaba en timeout por esta ruta pública acotada. Ver `docs/public-catalog.md`.

## Validación

`npm run build`, 12 pruebas locales y de QA en la ampliación, y revisión independiente. Ver `ops/reports/qa/wis-sqlite-review.md`. El reinicio con cuenta vinculada ya fue probado. Las pruebas de WhatsApp real de envío y multimedia saliente requieren aprobar los envíos concretos.

Ampliación de exploradores y respuestas comprobadas: 22 pruebas Node aprobadas, más una prueba de paginación del cliente Python. Validación en Chrome del explorador, detalle de grupos y comandos de lectura. No se enviaron mensajes ni se modificaron listas de bloqueo, grupos o productos.

Ampliación de mensajes e historial: 23 pruebas Node aprobadas en revisión independiente, comprobación sintáctica y nuevo reinicio con recuperación de sesión. Las pruebas de historial utilizaron un transporte simulado; no solicitaron mensajes al dispositivo real. Ver `docs/message-explorer.md`.

Validación final incluyendo el adaptador público y sus regresiones: **30/30 pruebas Node aprobadas**, comprobación sintáctica y revisión QA independiente. Dos consultas manuales desde Chrome comprobaron el resultado real de catálogo y colecciones. La sesión se recuperó sin QR; el contador de operaciones de envío permanece en cero. La matriz registra 33 métodos parcialmente cubiertos y 149 pendientes, sin declarar equivalencia completa.

Incremento posterior de webhooks: dispatcher integrado al worker, ledger con permisos, firma sobre bytes originales, destinos HTTPS públicos permitidos, reintentos limitados y recuperación de claims. **39/39 pruebas Node y 4/4 Python aprobadas**, más revisión independiente. Verificado en Chrome el registro vacío, filtro por fallos y contrato con salida desactivada. Cero destinos habilitados y cero entregas reales; no se activó n8n ni se inició un receptor externo. El ejemplo Python mantiene deduplicación durable; n8n sigue siendo un ejemplo inactivo de verificación que necesita persistencia antes de incorporar acciones. Ver `docs/webhooks-local.md`.

## Límites actuales

El runtime SQLite inicial administra un usuario administrador y una conexión. No implementa todavía usuarios operadores ni múltiples conexiones. La bandeja consulta el historial disponible; no hay garantía de historial completo. No se declara paridad WHAPI: administración avanzada de grupos, edición de canales/comunidades/catálogo, estados publicados y llamadas permanecen pendientes donde lo indica la matriz. Los esquemas de variables WHAPI son referencia, no prueba de implementación. La ejecución de campañas no está implementada. No se habilitaron webhooks externos ni workflows. Ver `docs/data-explorers.md` para límites de las nuevas lecturas.

El código heredado de Next/Supabase se conserva como referencia en su historial y carpetas, pero no forma parte del arranque activo. El manual vigente es `docs/sqlite-local.md`.
