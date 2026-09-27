# Consultar observaciones desde Python y n8n

Los recursos `/api/v1/calls`, `/api/v1/identities` y `/api/v1/stories` consultan la misma base SQLite que el dashboard. Requieren un token con permiso `read`. No crean otra sesión Baileys ni desencadenan una sincronización remota.

## Python

Configurar `WIS_API_URL` y `WIS_API_TOKEN` en el entorno del proceso. El valor del token no se incluye en archivos de ejemplo. Desde la carpeta `examples`:

```python
from python_client import WISClient

client = WISClient()
counts = {}
for item in client.iter_records('identities'):
    status = item.get('status', 'unknown')
    counts[status] = counts.get(status, 0) + 1
print(counts)  # Sólo cantidades; no imprime números ni identificadores.
```

Cambiar el recurso por `calls` o `stories` consulta esas observaciones. La paginación refleja una base viva: las altas, cambios y vencimientos pueden modificar páginas durante la lectura. Deduplicar por `id` y repetir la conciliación si se necesita una copia consistente.

## n8n

`examples/n8n-read-observations.json` se entrega inactivo y con disparador manual. Sus peticiones consultan únicamente la primera página de cada recurso; revisar `meta.has_more` antes de interpretar el resultado como completo.

Asignar una credencial Header Auth con nombre de encabezado `Authorization` y valor `Bearer <token>`. No pegar el token en el JSON del workflow. Importar el archivo no autoriza activarlo ni ejecutarlo contra servicios externos.

La URL local funciona sólo si n8n puede acceder al mismo host. Dentro de un contenedor, `127.0.0.1` apunta al contenedor. No cambiar el servidor WIS para escuchar públicamente como atajo; el acceso remoto requiere la configuración autenticada prevista para el traslado al servidor.

Los estados pueden desaparecer al vencer o revocarse. Las identidades conflictivas no autorizan a elegir un teléfono para enviar mensajes. Las llamadas reflejan eventos observados, no grabaciones ni un historial completo del dispositivo.

El cliente y el workflow rechazan redirecciones HTTP. Python admite HTTPS o HTTP de loopback, valida la ruta base `/api/v1` y usa un timeout configurable entre 1 y 60 segundos. Los helpers `calls()`, `identities()` y `stories()` recorren páginas; `detail(resource, id)` consulta un registro. Ejecutar el cliente directamente imprime sólo cantidades agregadas.

Validación 2026-09-27: cinco pruebas del cliente Python y tres de contratos n8n aprobadas; revisión independiente completada. Las peticiones se simularon: no se importó ni activó n8n, no se crearon tokens ni se enviaron mensajes. La importación y ejecución dentro de una instalación real de n8n quedan pendientes.
