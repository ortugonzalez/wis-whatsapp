# WIS WhatsApp SQLite — QA independiente

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
