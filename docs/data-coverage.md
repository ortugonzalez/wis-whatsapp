# Cobertura de datos observados

`GET /api/v1/coverage` devuelve conteos de contactos, conversaciones, grupos y mensajes, más la cantidad por tipo de mensaje. Para cada tipo de snapshot local devuelve el número de registros, la observación más reciente y la unión de nombres de campos presentes.

La respuesta no contiene nombres, teléfonos, JID, cuerpos de mensajes, valores de perfil, credenciales ni códigos QR. Sirve para ver qué partes del modelo se han observado y qué campos aparecieron; no implica que todas las entidades tengan esos campos ni que WhatsApp haya entregado el historial completo.

La vista «Cobertura de datos observados» aparece en Inicio y se actualiza cada 15 segundos mientras esa pantalla permanece abierta. Los snapshots se consultan como agregados y claves JSON; los valores privados se siguen consultando en sus pantallas autorizadas.
