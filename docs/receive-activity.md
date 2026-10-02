# Observación pasiva de recepción

2026-10-02. Ruta 3/4: instrumentación de eventos existentes, persistencia SQLite, API y vista general.

Se registra la hora del servidor para el último lote entrante `messages.upsert` de tipo `notify` y `append` por separado. Solo envelopes con `fromMe=false`, chat presente y objeto mensaje. No se guardan contenido, nombres, direcciones ni identificadores en estos snapshots. El callback comparte el control de propiedad del socket vigente.

Estos indicadores no cuentan mensajes únicos: una repetición puede avanzar la fecha. Tampoco demuestran persistencia completa ni entrega a una persona. La importación `messaging-history.set` y los ecos salientes no alimentan estos indicadores. Una fecha ausente significa que no se observó aún un lote compatible desde esta instrumentación, no que nunca llegaron mensajes.

La API overview expone last_inbound_notification_at y last_inbound_append_at; conserva separado el timestamp histórico last_inbound_message_at. La UI explica los límites y actualiza mediante el polling existente. Sin nuevas solicitudes a WhatsApp, mensajes de prueba o activación de automatizaciones.

Pruebas focales de clasificación, repetición, pérdida de propiedad y exclusión de contenido privado; contrato HTTP comprueba null inicial y fecha observada distinta de fecha del snapshot. Suite completa: 282/282. QA independiente PASS, 3/3 focales.

Producción: EasyPanel Success 2026-10-02 22:12:24 UTC. Chrome muestra los dos indicadores sin fecha inicial y las aclaraciones de alcance. No se observó aún un lote real compatible desde el despliegue: la prueba de llegada permanece sintética. Identidad verificada en el panel; no se cambió la configuración de envíos.

Próxima ruta: confirmar observaciones pasivas reales cuando lleguen por uso normal, sin crear tráfico para poblar métricas; continuar brechas de variables WHAPI.
