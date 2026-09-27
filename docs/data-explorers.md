# Exploradores de datos de WhatsApp

El panel ofrece detalles de contactos (identidad, perfil observado, presencia y conversaciones) y grupos (propiedades, participantes y roles). Los exploradores comerciales muestran productos, colecciones y bloqueados; las otras secciones muestran etiquetas, asociaciones, comunidades y canales.

Las consultas son de lectura. No siguen canales, no agregan participantes, no cambian bloqueos ni modifican el catálogo. El acceso a bloqueados requiere administrador. Los destinos individuales deben existir en los registros locales de la cuenta; no se exploran identificadores arbitrarios.

## Disponibilidad y límites

- Sin recopilar: aún no se ejecutó la consulta ni llegó un evento.
- No expuesto: la consulta no pudo obtener información; no implica que la cuenta carezca de datos.
- Completo: consulta terminada dentro del alcance señalado.
- Parcial/truncado: se alcanzó un límite o el origen solo informa eventos/recursos conocidos.

La ruta pública del catálogo consulta hasta 3 páginas de 50 productos. Las colecciones públicas se limitan a una página de 50, con hasta 50 productos por colección; se conserva el indicador de paginación. El alcance público no incluye productos ocultos ni administración privada. El adaptador IQ anterior conserva sus límites de 100 en pruebas, pero no es la ruta preferida del runtime. Ver [evidencia de la alternativa pública](public-catalog.md).

La consulta de canales considera únicamente los conocidos y como máximo 20 por lote. Las etiquetas dependen de eventos entregados por WhatsApp; no se promete recuperar todo su estado anterior. La consulta de comunidades se basa en grupos participantes y metadatos expuestos.

Durante la validación real, la promesa de catálogo terminó aproximadamente 61 segundos después del inicio. La revisión de Baileys reveló que `waitForMessage` puede devolver `undefined` tras un timeout y su parser convertirlo en una lista vacía: la terminación de esa promesa no prueba una respuesta real. Por ello se exige validar el nodo de respuesta antes de aceptar un catálogo o colecciones vacíos. Los eventos `read.late_completed` y `read.late_failed` incluyen únicamente correlación, método y códigos sanitizados, sin cuerpos de error ni secretos. Las consultas no se solapan mientras una solicitud subyacente siga pendiente.

Los límites y las fechas de consulta deben conservarse junto al resultado. Un arreglo vacío sin consulta previa nunca se interpreta como ausencia confirmada de datos. Los esquemas WHAPI del catálogo de variables describen la API de referencia; los exploradores muestran lo que esta sesión obtuvo realmente.

## API

`GET /api/v1/contacts?id=UUID` y `GET /api/v1/groups?id=JID` exponen el detalle. Las listas `/products`, `/collections`, `/blocklist`, `/labels`, `/label-associations`, `/communities` y `/channels` bajo `/api/v1` incluyen `data` y metadatos de paginación/disponibilidad. Las lecturas remotas se solicitan por `/api/v1/sync` con tipos documentados en OpenAPI.

El cliente Python incluye `iter_records('contacts')` o `iter_records('messages', conversation_id='...')` para recorrer páginas. La paginación refleja una base viva: si cambia durante una exportación, el consumidor debe deduplicar por `id` y reconciliar resultados. Las consultas del cliente no disparan sincronización remota ni envíos.
