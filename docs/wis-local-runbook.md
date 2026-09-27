> Arquitectura actual: SQLite, sin Supabase ni Docker. Ver [manual SQLite](sqlite-local.md). El contenido anterior debajo es histórico.

# WIS WhatsApp — operación local

## Estado y límites

Conexión prevista: WIS · 5679. El número completo debe ingresarlo el administrador en Configuración de WhatsApp; no se deduce a partir de sus últimos cuatro dígitos. Los envíos requieren coincidencia exacta con la identidad vinculada.

Entorno desarrollado en Windows, panel Next.js 16.3.6 y worker Baileys separados. Base, Auth, Realtime y archivos: Supabase local. La matriz `public/whapi-capabilities.json` inventaría 182 métodos de WHAPI; estados parciales y pendientes son brechas, no funciones verificadas.

Durante esta implementación Docker Desktop falló antes de ofrecer un motor Linux: sockets AF_UNIX residuales y posteriormente `Lingering processes detected`. Se conservaron respaldos de directorios de sockets bajo LocalAppData (`Docker/run.wis-*`, `docker-secrets-engine.wis-*`); no se borraron volúmenes, contenedores ni bases. No se hizo un factory reset. Si persiste el error, cerrar el aviso con Stop processes y reiniciar Windows antes de intentar nuevamente. El reinicio no fue ejecutado por el agente.

## Instalación y arranque

Desde este repositorio, con Docker Desktop funcionando:

```powershell
rtk npm ci
rtk npm --prefix workers/whatsapp-baileys ci
rtk npm run local:db
rtk npm run local:setup
rtk npm run dev
```

En otra terminal:

```powershell
rtk npm run worker
```

Abrir `http://localhost:3010`. Sin configuración o servicios disponibles se muestra `/setup`, nunca un dashboard con métricas inventadas. Supabase usa puertos 55320–55329 para separarse de otros proyectos. El bootstrap acepta exclusivamente 127.0.0.1/localhost:55321.

El administrador inicial es `admin@wis.local`. La contraseña aleatoria queda en `.local/credentials.json`; no se imprime ni se incorpora a Git. El bootstrap protege `.local` y archivos de entorno con ACL del usuario y SYSTEM en Windows. No compartir esos archivos ni el QR.

## Vincular y verificar

1. Ingresar con el administrador. Abrir Configuración de WhatsApp.
2. Registrar el número E164 completo, incluido `+` y código de país.
3. Solicitar QR y escanear desde WhatsApp → Dispositivos vinculados.
4. Verificar que la identidad conectada coincide. La sesión persiste al reiniciar; «Cerrar sesión» sí la revoca.
5. Conservar `WIS_OUTBOUND_ENABLED=false` tanto en panel como worker hasta aprobar una prueba real concreta. Esta instalación no realizó envíos.

Una pérdida breve de red permite reconexión limitada; sesión revocada requiere nuevo QR. Un segundo worker no puede obtener el lease de una sesión en uso. Nunca arrancar local y servidor a la vez sobre la misma copia de credenciales.

## Python, n8n y webhooks

Crear token desde Dashboard → Tokens. El token completo se muestra una vez; guardar en el gestor de secretos del consumidor. Revocarlo desde el panel. Ejemplos en `examples/python_client.py` y `examples/n8n-*.json`; los workflows vienen inactivos. Para n8n remoto, localhost de esta PC no es accesible: preparar servidor HTTPS o conectividad privada antes de operar, sin exponer directamente Supabase ni el worker.

Registrar consentimiento y bajas desde Contactos. Todo envío verifica consentimiento en API, cola y nuevamente en worker. No usar `transactional` para eludir controles. Los grupos salientes y campañas permanecen bloqueados mientras no exista política de destinatarios y aprobación de ejecución.

El dispatcher `examples/webhook-dispatcher.mjs` procesa un lote por invocación y está deshabilitado por defecto. Su activación/repetición programada requiere aprobación concreta. Exige HTTPS, lista explícita de hosts y destinos públicos; firma cuerpo crudo con timestamp. `examples/webhook_receiver.py` verifica firma y antigüedad y persiste eventos idempotentemente en SQLite; no ejecuta trabajo comercial. Para producción, publicar ese receptor detrás de HTTPS y consumir su inbox durable. No usar el callback sin verificar firma.

`examples/n8n-receive-webhook.json` es un tercer workflow inactivo que verifica HMAC, timestamp e identificador sin ejecutar acciones comerciales. Requiere conservar Raw Body, permitir `crypto` en Code y configurar `WIS_WEBHOOK_SECRET` con acceso desde el runner. No se cambiaron esos permisos en tu n8n ni se importó/activó el flujo. Antes de añadir acciones, agregar deduplicación durable por `event_id`. Referencia: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook .

Estados de operación: aceptar en cola no significa entregar. `outcome_unknown` requiere conciliación manual con teléfono, identificador y registros antes de reenviar. No borrar claves de idempotencia para forzar reintentos.

## Detener, respaldar y trasladar

- Detener panel y worker con Ctrl+C. `rtk npm run local:stop` conserva volúmenes Supabase. No usar `--no-backup` ni reset de DB sobre datos útiles.
- Antes de respaldo consistente: detener worker y dispatcher; detener cambios desde panel. Respaldar PostgreSQL, objetos privados de Storage y `.local/baileys-auth` como una unidad; cifrar el respaldo y conservar las claves fuera del repositorio. No incluir secretos en informes.
- Restaurar en entorno aislado y comprobar migraciones, membresías y objetos. Una copia SQL sola no restaura multimedia ni sesión de WhatsApp.
- Traslado a servidor: HTTPS y autenticación, almacenamiento persistente, secretos protegidos y backups cifrados; detener primero el worker local, esperar vencimiento/liberación del lease y arrancar únicamente el del servidor. Hacer prueba de restauración antes del cambio. No se desplegó ningún servicio externo.

## Verificación disponible

```powershell
rtk npm run build
rtk npm run lint
rtk node scripts/test-migrations.mjs
rtk npm run test:worker
rtk npm run test:api
```

El test de migraciones usa PostgreSQL embebido PGlite sin red, con esquemas mínimos Auth/Storage para probar SQL y RLS. No sustituye Supabase Auth, Realtime, Storage HTTP ni la prueba QR real. `examples/api-database-test.sql` se puede ejecutar en la base local aislada, sin worker, y hace rollback.

Historial: se conserva lo entregado por WhatsApp con fecha original; no se promete historial completo ni descarga de archivos históricos. Estados, comunidades, catálogo, llamadas y otros métodos no implementados quedan explicitados en el catálogo.

Baileys es una conexión no oficial. Consentimiento, permisos, límites e idempotencia no garantizan que WhatsApp no suspenda la línea.
