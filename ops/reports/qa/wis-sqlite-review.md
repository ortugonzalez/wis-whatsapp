# WIS WhatsApp SQLite — QA independiente

## Ampliación de lectura — revisión posterior

Backend y worker aptos para reinicio con envíos desactivados. Se revisaron tablas adicionales snapshots/events/read_commands, paginación, multimedia autenticada y consultas de metadatos. El esquema es aditivo; la prueba de reapertura conserva contacto y sesión. No se consultó ni alteró la cuenta vinculada durante QA.

- Los comandos admitidos sólo invocan fetchStatus, fetchPrivacySettings, getBusinessProfile, groupFetchAllParticipating y groupMetadata. El endpoint requiere administrador y valida objetivos existentes. No hay despacho arbitrario de métodos del socket.
- Los snapshots/eventos usan listas explícitas de campos; quedan fuera credenciales, QR, códigos de invitación y envelopes criptográficos. Un timeout bloquea más lecturas en ese socket hasta que se resuelva la consulta pendiente, evitando acumulación de solicitudes.
- Las consultas paginadas parametrizan búsqueda y límites; la descarga de archivos verifica autenticación y ruta real dentro del directorio de multimedia.
- Corregidos durante revisión: horarios comerciales estructurados y fechas de estado descartados por el normalizador; búsqueda de una operación antigua aplicada después del límite de 100 registros.
- Ejecución independiente: backend (2), worker (6) y QA SQLite (3), **11/11 PASS**. Regresión adicional `test/qa/api-expansion.test.mjs`, **1/1 PASS**: operación antigua entre 130 registros, paginación y denegación de cuenta/sync a token de lectura, snapshot reservado y traversal multimedia.
- Esta aprobación técnica cubre lectura y almacenamiento local. No certifica todas las funciones WHAPI ni habilita mutaciones de cuenta, publicaciones, campañas o envíos. QA visual del panel ampliado se informa por separado.
- Panel ampliado revisado estáticamente: campos, JSON y referencia WHAPI escapados; multimedia usa endpoint local autenticado; detalles de esquemas se solicitan al abrir un método. Se detectó y corrigió un P2: refrescar más de 200 conversaciones enviaba un límite inválido; ahora se consultan tramos de hasta 200 y se deduplican por ID. `node --check local/public/live.js` aprobado. No se operó el navegador ni la cuenta desde QA.

Fecha: 2026-09-27. Alcance: runtime activo `local/`, esquema SQLite, panel estático, scripts locales y dispatcher. No se usaron Supabase, Docker, Chrome ni conexiones reales a WhatsApp durante QA.

## Dictamen para inicio local

Apto para iniciar el panel en loopback y generar el QR solicitado con **WIS_OUTBOUND_ENABLED=false**. Este dictamen no habilita envíos, campañas ni entregas externas de webhooks. La verificación real de identidad y sesión queda pendiente del enlace del usuario.

## Hallazgos corregidos y revisados

- Contrato SQLite actualizado: contactos LID admiten teléfono desconocido; operaciones admiten delivered/read sin provocar excepción del worker.
- Tokens validan el permiso de la ruta; no requieren implícitamente read para operaciones de escritura.
- Eventos de mensajes/operaciones generan entregas durables mediante triggers para webhooks habilitados.
- Dispatcher reclama sólo hooks habilitados, limita intentos, recupera claims interrumpidos y conserva controles de destino público, host permitido, DNS fijado, firma y plazo absoluto.
- Inicio normal protege `.local` mediante setup antes de arrancar procesos; backups se guardan en `.local/backups`.
- Worker fusiona echo propio con el mensaje encolado dentro de una transacción y determina MIME de audio según el archivo.
- Confirmaciones anticipadas: buffer acotado a 5000 identificadores conserva el estado máximo y lo aplica al confirmar el envío. Prueba independiente simula read antes del retorno de sendMessage y confirma que delivered/sent posteriores no lo degradan. Hallazgo cerrado.
- Root informó preservación privada de la base preliminar vacía y recreación del esquema corregido. CREATE TABLE IF NOT EXISTS no sustituye una estrategia de migraciones para futuras bases con datos.

## Evidencia independiente

- `rtk npm run test:local`: **4/4 PASS**, autorización HTTP, consentimiento, transacción de cola, replay, QR privado, identidad, rutas, lease exclusivo y persistencia con socket simulado.
- `rtk node --test test/qa/sqlite-review.test.mjs`: **3/3 PASS**, mensajes LID y estados de receipt compatibles; identidad completa equivocada desconecta y borra QR; confirmaciones anticipadas preservan read. El envío de esta prueba usa exclusivamente un socket simulado y SQLite en memoria; no modifica flags del proceso real.
- Inspección estática: host y origen restringidos a loopback; cookie HttpOnly/SameSite Strict; contraseña derivada con scrypt; tokens almacenados por hash; rutas estáticas y multimedia acotadas; salida dinámica del panel escapada; QR reservado al administrador y con vencimiento.

## Límites y seguimiento

- Ninguna prueba abrió un socket real de WhatsApp ni envió mensajes. Reinicio con sesión real, revocación, multimedia recibida y confirmaciones reales necesitan validación posterior.
- El runtime implementa una conexión y un administrador local. No certifica cuentas de operador, aislamiento multiconexión ni paridad completa de WHAPI.
- La protección de ACL debe verificarse en el equipo efectivo; el informe revisa su invocación en el arranque, no certifica configuración histórica de permisos ajena al proyecto.
- El arranque tras interrupción de bootstrap, la restauración completa con sesión y la actualización de esquemas con datos requieren pruebas específicas adicionales.
- La revisión del panel fue estática; no se realizó QA visual o de navegador en esta revisión.
