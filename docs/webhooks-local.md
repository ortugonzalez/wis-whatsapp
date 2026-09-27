# Webhooks locales: operación y diagnóstico

El worker activo administra la cola SQLite de webhooks. La salida externa sigue desactivada por defecto y no fue activada en la instalación real. Registrar un destino no lo activa. No existe un botón de prueba que envíe eventos sin aprobación.

## Qué entrega

Los triggers actuales generan `message.created`, `message.updated` (cambio de estado de entrega) y `operation.updated` (cambio del estado de una operación). Solo se encolan para destinos habilitados en el momento del evento. No se reconstruyen automáticamente eventos anteriores al alta. El catálogo `/api/v1/webhook-events` separa estos tres eventos de las categorías de referencia de WHAPI.

El cuerpo tiene `id`, `type` y `data`. El mismo evento conserva su identificador y los mismos bytes en todos sus intentos. La entrega es **al menos una vez**: una caída después de que el receptor procesó el evento puede causar repetición. El consumidor debe persistir y deduplicar por `id` antes de confirmar, y ejecutar sus efectos comerciales por separado con idempotencia.

## Firma y receptor

- `X-WIS-Event-ID`: debe coincidir con `id` del cuerpo.
- `X-WIS-Timestamp`: segundos Unix del intento actual.
- `X-WIS-Signature`: `sha256=` seguido del HMAC-SHA256 hexadecimal de `timestamp + "." + cuerpo original`, usando el secreto del destino.

La firma se comprueba sobre los **bytes originales**, no sobre JSON reserializado. Los ejemplos rechazan una diferencia de reloj mayor de 300 segundos, sobres incompletos y cuerpos mayores de 1 MiB. Se necesita un reloj sincronizado.

`examples/webhook_receiver.py` verifica firma, guarda un inbox SQLite y recién después responde 200. Conserva la deduplicación tras reiniciar; un mismo ID con bytes diferentes devuelve 409 y no modifica el evento previo. Un error de persistencia devuelve 503. No ejecuta acciones comerciales ni reenvía eventos. El servidor de ejemplo escucha solo en loopback; para usarlo como destino real necesitaría HTTPS y un despliegue autorizado.

`examples/n8n-receive-webhook.json` permanece **inactivo**. Verifica firma y estructura usando Raw Body, pero es únicamente un ejemplo de verificación: **no tiene deduplicación durable**. Antes de conectar acciones debe incorporar una base con ID único y una cola transaccional, o consumir el inbox del receptor Python. El nodo Code requiere acceso autorizado a `crypto` y a la variable de entorno del secreto; no se modificó la configuración de n8n.

## Cola y reintentos

El dispatcher requiere simultáneamente el flag global, el destino habilitado y la propiedad vigente del worker. Los destinos deben ser HTTPS en puerto 443 y estar en una lista explícita de hosts. Se resuelve IPv4 pública, se fija la IP para evitar un cambio de DNS entre validación y conexión y no se siguen redirecciones.

Se procesa un registro por ciclo, con claim transaccional y lease de 60 segundos. El DNS tiene límite de 5 segundos y la solicitud de 15 segundos. Hay hasta cinco intentos totales, con cuatro esperas de 2, 4, 8 y 16 segundos. Después del quinto fallo el registro queda `failed`; no hay reenvío automático ilimitado. Una entrega interrumpida conserva su ID al recuperar el lease. Los errores públicos son códigos de una lista explícita, nunca respuestas crudas del receptor.

## Panel y API

Integraciones muestra estado de salida, destinos, conteos y entregas filtrables. `pending` significa en cola; no implica que el receptor lo haya recibido. `delivered` indica respuesta HTTP 2xx, no ejecución del trabajo comercial del consumidor. Deshabilitar un destino conserva su historial.

- `GET /api/v1/webhooks`: configuración sin secretos y conteos.
- `GET /api/v1/webhook-deliveries?webhook_id=ID&status=failed`: registros paginados sin payload.
- `GET /api/v1/webhook-deliveries?id=ID`: detalle con payload saneado, solo administrador.
- `GET /api/v1/webhook-events`: contrato e inventario de eventos actuales.

Estos recursos requieren el permiso `webhooks:write`; el detalle además exige sesión administrativa. El secreto se muestra una única vez al registrar el destino. No debe incluirse en logs, URLs, capturas, repositorios ni documentación.

## Activación pendiente

Antes de activar se debe presentar el destino exacto, eventos y datos que recibirá, impacto y política de retención, obtener aprobación humana y configurar el host permitido, el flag y el destino. Este incremento no realiza esos pasos ni despliega un receptor. El antiguo comando `examples/webhook-dispatcher.mjs` ya no envía: el dispatcher pertenece al worker supervisado.

Validación offline: `node --test local/webhooks.test.mjs examples/webhook-dispatcher.test.mjs examples/n8n-contract.test.mjs` y `python examples/webhook_receiver_test.py`. Se usan transportes simulados y bases temporales; no se llama a destinos reales.
