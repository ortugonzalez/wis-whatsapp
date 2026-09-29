# Despliegue local-first en Easypanel

## Servicio inicial

Crear un servicio **App** en el proyecto Easypanel `wis`, con el código de este repositorio y el `Dockerfile` incluido. En Windows se puede generar el archivo fuente filtrado con `powershell -ExecutionPolicy Bypass -File scripts/package-easypanel.ps1`; el ZIP se crea junto al worktree y comprueba que no incluya `.local`, autenticaciones, bases ni secretos. En Easypanel, elegir **Upload**, subir el ZIP y seleccionar el builder **Dockerfile**. Configurar el puerto de destino `3010` y el health check `/api/local-status`. Asignar HTTPS y marcar ese dominio como principal antes de desplegar. El hostname exacto se puede tomar de `$(PRIMARY_DOMAIN)` para `WIS_ALLOWED_HOSTS`; el contenedor solo acepta ese hostname cuando `WIS_TRUST_PROXY=true`.

Montar un volumen persistente en `/app/.local`. Allí quedan SQLite, sesiones administrativas y datos de la aplicación. No montar ni importar los datos `.local` de un equipo de desarrollo. La imagen excluye `.local`, autenticaciones Baileys, bases locales, variables `.env` y credenciales. El primer arranque inicializa una base nueva, genera una contraseña de administrador aleatoria en `.local/admin-access.txt` y arranca el panel.

El worker Baileys, envíos y entrega de webhooks quedan desactivados. La app no enlaza una cuenta ni envía mensajes durante el despliegue. La contraseña inicial se debe leer por la consola privada del contenedor/volumen de Easypanel y cambiarse después del primer acceso. Nunca ponerla en la imagen, Git ni logs compartidos.

Variables de despliegue:

```text
WIS_ALLOWED_HOSTS=$(PRIMARY_DOMAIN)
WIS_TRUST_PROXY=true
WIS_WORKER_DISABLED=true
WIS_OUTBOUND_ENABLED=false
WIS_WEBHOOKS_ENABLED=false
```

No usar `*` en `WIS_ALLOWED_HOSTS`. El dominio y certificado TLS deben estar activos antes de abrir el panel. La aplicación exige un único `X-Forwarded-Proto: https` para tráfico externo y rechaza hosts externos por HTTP. Las cookies administrativas llevan siempre `Secure` en el dominio público; el health check local no necesita cabeceras del proxy.

## Antes de habilitar WhatsApp

La base remota comienza vacía por privacidad. La cuenta y los mensajes locales no se transfieren. Para utilizar la integración después, primero validar dominio TLS, volumen persistente, contraseña de administrador, backups cifrados y restauración. Luego revisar Baileys/WhatsApp y aprobar expresamente el enlace de la cuenta. Solo después se podrá cambiar `WIS_WORKER_DISABLED=false`, desplegar ese cambio y escanear un QR desde el panel. No ejecutar el worker simultáneamente en local y remoto.

El uso de Baileys es una integración no oficial y no garantiza evitar restricciones o suspensiones. Mantener envíos y webhooks apagados hasta revisar consentimiento, destinatarios, límites y flujos.

## Comprobación

El health check consulta únicamente el estado público del servicio. Debe devolver HTTP 200 después de iniciar. Si la app devuelve `invalid_host`, revisar que `WIS_ALLOWED_HOSTS` coincida exactamente con el hostname que envía el proxy. Si no se puede iniciar la sesión, confirmar que `/app/.local` sea escribible y persistente.
