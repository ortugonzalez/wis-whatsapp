# Catálogo de un contacto conocido

El detalle de contacto permite solicitar una lectura de su catálogo cuando tiene un identificador PN ya guardado. Los identificadores LID no se convierten a teléfonos ni se prueban como si fueran PN. No se descubren números, se crean contactos o se envían mensajes.

La solicitud administrativa `POST /api/v1/sync` con `kind:contact_catalog` y `target` valida de nuevo el contacto en API y worker. Usa la consulta de catálogo de Baileys con un máximo de tres páginas de cien productos, tiempos acotados y detección de cursores repetidos. El resultado se almacena bajo el propietario correspondiente; un fallo conserva la información anterior como antigua. No reutiliza la consulta pública de la cuenta propia para otro contacto.

`GET /api/v1/contact-products?target=JID` consulta solo el conjunto local de ese propietario, con búsqueda y paginación. Python puede usar `iter_records('contact-products', target=jid)`. No solicita una nueva lectura remota. Productos ausentes y consulta no disponible son estados diferentes. El panel no descarga imágenes ni permite pedidos.

Referencia: https://whapi.readme.io/reference/getcontactproducts (2026-09-27). WHAPI admite un alcance de identificadores más amplio; WIS mantiene cobertura parcial, limitada a contactos PN conocidos. No se declara equivalencia completa ni acceso garantizado a un catálogo comercial.

Validación: 44 pruebas locales y las dos pruebas específicas de API/worker aprobadas, con revisión independiente. Chrome mostró la sección en un contacto real sin PN inequívoco y mantuvo deshabilitada la consulta correspondiente. No se realizó una consulta remota de catálogo en esta verificación; el éxito con productos reales sigue pendiente. La sesión persistente se conservó al cargar la versión.
