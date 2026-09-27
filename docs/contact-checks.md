# Verificación de registro WhatsApp

Desde Contactos, un administrador puede solicitar una consulta individual para un número E.164 que ya exista en la agenda local. La API no recibe un teléfono arbitrario: `POST /api/v1/sync` acepta únicamente el ID local del contacto conocido. Las consultas repetidas se deduplican mientras están pendientes y tienen un cooldown local de 15 minutos.

Baileys `onWhatsApp` devuelve los registros positivos, pero filtra del resultado las respuestas negativas. Por eso WIS guarda como **Registrado** solo una coincidencia positiva exacta; una lista vacía permanece como **Desconocido**. No se convierte en “No registrado”. Tampoco se considera que la verificación dé consentimiento para enviar mensajes.

La respuesta se guarda en SQLite como snapshot `contact_check`, asociada al ID local del contacto. `GET /api/v1/contact-checks` lista resultados cacheados; `GET /api/v1/contact-checks?id=<contact-id>` incluye resultado y estado de la solicitud.

WHAPI documenta consulta por lote y comprobación individual. Esta implementación solo cubre la consulta individual desde un contacto conocido, por lo que ambas capacidades permanecen parciales. No se ejecutó ninguna consulta real durante las pruebas.
