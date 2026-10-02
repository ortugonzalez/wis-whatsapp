# Fecha de perfil en la vista general

2026-10-02. Ruta 4: corrección de frescura en API y dashboard.

`overview.account_updated_at` consultaba todos los snapshots de la conexión, por lo que un historial u otro dato posterior podía adelantar erróneamente la fecha presentada como perfil actualizado. Ahora consulta exclusivamente `kind=profile` de la cuenta propia. Sin perfil, devuelve null.

La UI identifica el último mensaje entrante como almacenado y advierte que puede provenir de una importación. Su fecha no es evidencia de recepción reciente. No se cambió el contrato de `last_inbound_message_at` ni se inventó una fecha de recepción.

Pruebas: 281/281 de la suite completa. QA independiente PASS, 2/2 focales; ausencia de perfil, perfil ajeno, historial y ajustes más nuevos no contaminan la fecha. Sin envío ni lecturas nuevas al proveedor. Despliegue pendiente de verificación.

Próxima ruta: observación pasiva de recepción con fecha propia, diferenciando notify/append e historial; no inferir actividad de la fecha del mensaje o de un estado conectado.
