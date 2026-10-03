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

## Actualización de una instalación ya vinculada

Las variables anteriores describen el primer despliegue: no deben copiarse sobre una instalación ya configurada para intentar reparar su arranque. Conservar las variables, volumen y sesión existentes.

La auditoría de Chrome del 2026-10-03 00:51 UTC encontró una réplica, Cero tiempo de inactividad desactivado y Tini Init desactivado. Son observaciones de configuración, no cambios aplicados. En el despliegue anterior hubo una respuesta Not Found transitoria entre la construcción exitosa y el arranque accesible. Es compatible con un reemplazo de una sola réplica; no se inspeccionó el estado interno del proxy para afirmar la causa exacta.

No activar Cero tiempo de inactividad ni aumentar réplicas como arreglo rápido: un despliegue con contenedores superpuestos puede arrancar dos supervisores sobre la misma sesión. El bloqueo del supervisor usa identidad de proceso/PID, limitada al namespace del contenedor; no es prueba de exclusión entre contenedores. El lease del worker protege acceso SQLite compartido, pero no convierte toda la aplicación en una arquitectura segura de múltiples réplicas. Conservar una réplica y exclusión de la sesión hasta diseñar y probar el cambio de arquitectura.

Para una actualización autorizada:

1. Verificar cola y operaciones en procesamiento; reunir cambios revisados para reducir reinicios.
2. Publicar una vez y esperar el resultado de esa misma implementación. Success en construcción no confirma que el dominio ya esté listo.
3. Comprobar que `/api/local-status` responde HTTP 200 con JSON y `data.status` válido. El Dockerfile permite 20 segundos iniciales y consulta cada 30 segundos; estos intervalos no son un SLA del proxy.
4. Ante HTML Not Found durante el reemplazo, esperar el arranque y repetir una comprobación acotada, sin generar otro despliegue, recrear servicios, borrar la base ni volver a vincular. Si persiste tras el arranque, revisar estado de contenedor y ruta del proxy con evidencia sanitizada.
5. Verificar la pantalla de acceso/panel y, aparte, conexión y lease. Un health check HTTP sano no demuestra WhatsApp conectado; conectado tampoco demuestra recepción reciente.

El supervisor tiene una ruta interna de recarga solo del proceso API que conserva el worker; no cambia automáticamente el código dentro de una imagen Docker inmutable. No usar esa recarga como sustituto de desplegar una imagen nueva ni editar archivos del contenedor en vivo. Una futura separación API/worker requiere diseño de volúmenes, migraciones, exclusión y recuperación antes de cambiar producción.
