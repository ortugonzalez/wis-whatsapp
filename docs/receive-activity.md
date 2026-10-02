# Observación pasiva de recepción

2026-10-02. Ruta 3/4: instrumentación de eventos existentes, persistencia SQLite, API y vista general.

Se registra la hora del servidor para el último lote entrante `messages.upsert` de tipo `notify` y `append` por separado. Solo envelopes con `fromMe=false`, chat presente y objeto mensaje. No se guardan contenido, nombres, direcciones ni identificadores en estos snapshots. El callback comparte el control de propiedad del socket vigente.

Estos indicadores no cuentan mensajes únicos: una repetición puede avanzar la fecha. Tampoco demuestran persistencia completa ni entrega a una persona. La importación `messaging-history.set` y los ecos salientes no alimentan estos indicadores. Una fecha ausente significa que no se observó aún un lote compatible desde esta instrumentación, no que nunca llegaron mensajes.

La API overview expone last_inbound_notification_at y last_inbound_append_at; conserva separado el timestamp histórico last_inbound_message_at. La UI explica los límites y actualiza mediante el polling existente. Sin nuevas solicitudes a WhatsApp, mensajes de prueba o activación de automatizaciones.

Pruebas focales de clasificación, repetición, pérdida de propiedad y exclusión de contenido privado; contrato HTTP comprueba null inicial y fecha observada distinta de fecha del snapshot. Validación completa, QA y despliegue pendientes de registrar.

Próxima ruta: confirmar observaciones pasivas reales cuando lleguen por uso normal, sin crear tráfico para poblar métricas; continuar brechas de variables WHAPI.
