# Consumir observaciones pasivas

La API WIS usa un contrato propio. OpenAPI (`GET /api/v1/openapi`) documenta los campos nuevos, el detalle de grupos y los ajustes exclusivos del administrador. No es un reemplazo directo del contrato WHAPI.

## Python

Configurar `WIS_API_URL` con la URL HTTPS de la instalación terminada en `/api/v1`, y `WIS_API_TOKEN` con un token read existente. Usar `examples/python_client.py`:

```python
from python_client import WISClient

client = WISClient()
for snapshot in client.snapshots('newsletter_view'):
    observation = snapshot['data']
    # Guardar o procesar privadamente observation y su observed_at.
    # Ausencia de un snapshot no significa cero visualizaciones.

for snapshot in client.snapshots('newsletter_reaction'):
    observation = snapshot['data']
    # reported_event_count es un dato de notificación, NO sumar como total.

# Con un identificador de grupo conocido:
# labels = client.detail('groups', group_id)['observed_member_tags']
# Revisar labels['truncated']; las etiquetas no prueban membresía actual.
```

`snapshots` recorre páginas locales sin consultar WhatsApp. La colección puede cambiar durante la paginación; no es una exportación transaccional ni un stream de eventos deduplicado. No imprimir datos personales en logs compartidos. Los ajustes de cuenta no están disponibles mediante este token: requieren sesión administrativa en el panel.

## n8n

Importar `examples/n8n-read-channel-observations.json`. Permanece desactivado y solo tiene disparador manual. Cada HTTP Request necesita una credencial Header Auth seleccionada dentro de n8n y un host accesible desde esa instalación. No incluye secretos ni modifica workflows existentes.

El ejemplo obtiene únicamente la primera página de 50 registros de visualizaciones y reacciones. Revisar `meta.has_more` y `meta.total`; no se presenta como lectura completa. No envía mensajes, crea suscripciones ni consulta remotamente WhatsApp. No se ejecutó contra una instalación real de n8n en esta entrega; las verificaciones son de estructura y contrato.
