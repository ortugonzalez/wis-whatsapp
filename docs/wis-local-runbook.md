# Operación de WIS WhatsApp local

La instalación activa usa SQLite, un panel Node local y un worker Baileys. Supabase y Docker no forman parte del runtime. Para instalación reproducible, arquitectura y límites, consultar [SQLite local](sqlite-local.md).

## Inicio y acceso

Desde la raíz del worktree:

```powershell
rtk npm ci --ignore-scripts
rtk npm run local:setup
rtk npm start
```

Abrir `http://127.0.0.1:3010` en Chrome. El usuario administrador local se genera durante `local:setup`; sus datos quedan en `.local/admin-access.txt`. La base, credenciales y sesión están bajo `.local/`, excluida de Git y protegida con ACL en Windows. No pegues su contenido en chats ni informes.

El acceso requiere la contraseña de administrador. Si ya se ejecutó setup y no la tienes a mano, consulta el archivo local desde el equipo; no vuelvas a inicializar ni reemplaces la base para recuperarla. El setup existente no debe ejecutarse como procedimiento de recuperación.

Para detener ordenadamente panel y worker, usa `rtk npm run local:stop`. Reiniciar el panel no debería revocar la sesión. Evita terminar a la fuerza el proceso worker mientras mantiene el lease.

## Conexión de WhatsApp

El panel local y WIS Command Center son instalaciones diferentes y no comparten automáticamente la sesión. Una conexión visible en Command Center no indica que el worker SQLite local esté conectado.

La pantalla de acceso muestra un estado local resumido antes de iniciar sesión (`/api/local-status`), incluido el último código de cierre y una causa de una lista fija cuando Baileys los informa. No devuelve número, identidad, QR, texto de error del proveedor ni datos de sesión. Para ver o solicitar el QR hay que autenticarse en el panel local.

En el panel local, iniciar sesión, abrir **Conexión**, solicitar el QR temporal y escanearlo desde WhatsApp → **Dispositivos vinculados**. Confirmar en el panel la identidad completa devuelta por WhatsApp; el sufijo 5679 por sí solo no identifica una cuenta. No ejecutar un segundo worker ni copiar la carpeta de sesión a otra instalación mientras la sesión local esté activa.

### Cierre `401 / logged_out` (`session_revoked`)

Este estado indica que Baileys recibió un cierre de sesión para las credenciales locales guardadas; por sí solo no prueba una suspensión, no identifica qué dispositivo lo causó y no significa que la conexión visible en otra instalación pertenezca a este worker. La orden **Conectar** reutiliza esas credenciales y puede repetir el mismo 401 en vez de generar un QR. No la repitas en ciclo ni borres manualmente `.local/baileys-auth` para forzar un QR. En esta versión no hay una recuperación segura automática de credenciales revocadas: conserva la sesión local y espera una recuperación controlada que respalde los archivos de autenticación de forma privada, detenga el único worker y retire solo la credencial local rechazada antes de iniciar una vinculación nueva. La acción **Cerrar sesión / logout** también borra los archivos JSON de autenticación de `.local/baileys-auth`, así que no la uses como sustituto del respaldo. No subas ese respaldo ni sus logs a Git, nube o chat. La nueva vinculación requiere que la persona con el teléfono escanee el QR y confirme la identidad.

Los mensajes y el historial se limitan a lo que WhatsApp entregue durante la vinculación y sincronización; no se promete recuperar el historial anterior completo. Baileys es una integración no oficial y no puede garantizar que WhatsApp no suspenda la línea.

### Cierre `440 / connection_replaced`

Este código indica que WhatsApp cerró el socket de Baileys como reemplazado; por sí solo no identifica qué instalación lo provocó ni significa que la línea esté suspendida. Comprueba primero que el QR se haya escaneado en `localhost:3010`, que exista un solo worker local y qué instalación mantiene la sesión en **Dispositivos vinculados**. Una conexión momentánea seguida por 440 no cuenta como estable. Conserva `.local/` y evita copiar, borrar o cerrar credenciales/dispositivos para “probar”; cuando se identifique la instancia propietaria, realiza un único reintento desde el panel local y verifica que permanezca conectada.

## API, Python y n8n

Python y n8n consumen `/api/v1` mediante tokens con permisos mínimos creados desde **Integraciones**. La sesión Baileys nunca se comparte directamente con consumidores. Los ejemplos de Python y los workflows incluidos están inactivos hasta que se configuren deliberadamente.

Los envíos están deshabilitados por defecto. Requieren consentimiento registrado, ausencia de baja e idempotencia; aceptar una operación en cola no demuestra entrega. Un resultado ambiguo necesita conciliación antes de reintentar. No habilites envíos, webhooks o workflows sin revisar destinatario, contenido e impacto concretos.

## Respaldo y recuperación

`rtk npm run local:backup` genera una copia consistente de SQLite en `.local/backups/`. Esa copia no incluye archivos de sesión ni multimedia. Para una copia integral, detener panel y worker y proteger conjuntamente la base, la sesión y los archivos privados. Restaurar con ambos procesos detenidos; nunca iniciar simultáneamente la sesión original y su copia. La documentación de SQLite local describe la validación y recuperación de backups.

## Cobertura

El inventario fechado de 182 métodos WHAPI está en `public/whapi-capabilities.json`; los campos y sus evidencias se describen en `docs/whapi-reference-fields.md`. `partial` indica soporte limitado y no equivale a paridad. Las funciones pendientes o no soportadas no deben presentarse como disponibles.

El detalle de conversación también ofrece una lectura Baileys bajo demanda del temporizador de mensajes que desaparecen; su alcance y diferencia frente a WHAPI están en [modo de mensajes que desaparecen](disappearing-mode.md).
