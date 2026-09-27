# Llamadas observadas

El panel conserva eventos de llamada que Baileys entrega a esta sesión. No consulta un historial completo del teléfono, no inicia ni rechaza llamadas y no accede al audio o a grabaciones.

La versión instalada expone estados `offer`, `ringing`, `preaccept`, `transport`, `relaylatency`, `timeout`, `reject`, `accept` y `terminate`, con identificador, origen, conversación, fecha y, cuando llegan, indicadores de video/grupo, grupo, teléfono del llamante y latencia. El panel describe estados observados; no deduce duración, facturación ni resultado comercial.

Los registros persistentes de llamadas se conservan separados de la actividad general, cuyo historial reciente tiene retención limitada. La ausencia de registros no demuestra que no haya llamadas en WhatsApp. Los eventos anteriores a esta función que ya no estén disponibles no se reconstruyen ni se inventan.

La API de lectura y los detalles requieren autenticación. Los identificadores y datos de contacto tienen la misma sensibilidad que las conversaciones: no se copian a informes de QA. Las pruebas usan eventos simulados, sin llamar a contactos. Una validación con una llamada real necesitaría autorización específica de destinatario e impacto.
