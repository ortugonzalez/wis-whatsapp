# WIS WhatsApp local · SQLite

La instrucción del 27/09/2026 sustituye Supabase/Docker por SQLite. El runtime activo está en `local/`: servidor Node, panel web y worker Baileys. Los directorios Next/Supabase anteriores quedan como referencia del repositorio original; no se ejecutan con `npm start`.

## Instalación y arranque

Requiere Node 24.13 o posterior y Chrome. Desde la raíz del worktree:

```powershell
rtk npm ci --ignore-scripts
rtk npm run local:setup
rtk npm start
```

Abrir http://127.0.0.1:3010 en Chrome. SQLite queda en `.local/wis.sqlite`; las credenciales administrativas locales se generan en `.local/admin-access.txt`. Esa carpeta está excluida de Git. `local:setup` restringe su ACL en Windows al propietario y SYSTEM. No publicar ni copiar credenciales al chat.

El panel y worker arrancan juntos. Para detenerlos desde otra terminal usar `rtk npm run local:stop`: el supervisor solicita cierre por IPC y permite liberar el bloqueo de la sesión antes de terminar. Ctrl+C también solicita ese cierre cuando llega al supervisor; algunos wrappers de terminal pueden terminar procesos abruptamente, por lo que se prefiere `local:stop`. Un reinicio no borra la sesión de WhatsApp. Usar el botón de desvinculación únicamente cuando se quiera revocar esa sesión.

## Vinculación

Ingresar al panel y abrir Conexión. Solicitar QR y escanear desde WhatsApp → Dispositivos vinculados. El QR es temporal y solamente se muestra a administradores. Verificar el número completo recibido de WhatsApp: el sufijo 5679 no identifica inequívocamente una cuenta. No hay garantía de recuperar todo el historial previo.

## Integraciones

Crear un token con los permisos mínimos desde Integraciones. El valor aparece una sola vez. Python y n8n llaman a `/api/v1`; jamás abren los archivos de sesión. Ver `examples/python_client.py` y workflows `examples/n8n-*.json`, entregados inactivos. Para n8n instalado en otra máquina se necesita un acceso HTTPS autenticado; el servidor inicial escucha sólo en loopback.

Los envíos están deshabilitados por defecto (`WIS_OUTBOUND_ENABLED=false`). Se requiere consentimiento registrado, ausencia de baja e idempotencia. La aceptación en cola no equivale a entrega. Un resultado ambiguo queda `outcome_unknown` y requiere reconciliación antes de reintentar. No activar envíos, webhooks o workflows sin aprobar destinatario, contenido e impacto concretos.

## Copia y recuperación

`rtk npm run local:backup` crea una copia consistente de SQLite en `.local/backups/`, con nombre único. Su salida identifica explícitamente que no incluye archivos de sesión, multimedia ni fotos. La copia puede realizarse con la base activa mediante la API de backup de SQLite.

Para copia integral: detener ambos procesos y copiar `.local/` de forma privada, incluyendo la sesión Baileys, multimedia y fotos. Restaurar con ambos procesos detenidos. No ejecutar simultáneamente la sesión original y su copia. Proteger los backups con ACL/cifrado del disco: SQLite no cifra por sí mismo.

Comprobar una copia con `rtk npm run local:backup:check -- .local/backups/NOMBRE.sqlite`. El verificador acepta solo archivos dentro de la carpeta privada de backups, abre el original en lectura y restaura una copia temporal aislada. Comprueba integridad, claves foráneas, estructura y conteos; elimina únicamente los archivos temporales que creó. No reemplaza la base activa, no inicia el worker ni abre una segunda sesión de WhatsApp. Su resultado no certifica los archivos externos ni equivale a una prueba de vinculación tras recuperar el equipo completo.

## Cobertura

El inventario público de WHAPI está en `public/whapi-capabilities.json`. `partial` no significa paridad: describe sólo la parte implementada. Las funciones pendientes no se presentan como operativas. Baileys es una integración no oficial y no garantiza evitar suspensiones.
