# Consulta administrativa de invitación

El detalle de un grupo conocido ofrece una consulta manual del enlace que devuelve WhatsApp. La implementación usa el IQ de tipo `get` correspondiente a `groupInviteCode` de Baileys; no llama a `groupRevokeInvite`, `groupAcceptInvite` ni a operaciones de tipo `set`.

La API `GET /api/v1/group-invite?target=JID` y la solicitud `group_invite` requieren sesión de administrador. Los tokens de lectura no tienen acceso. La respuesta solo puede exponer el código durante cinco minutos; el servidor comprueba el vencimiento aunque el worker no esté ejecutando su limpieza. Un error elimina el código de la respuesta disponible, sin reutilizar un enlace anterior como actual.

El panel muestra texto sin navegación externa automática. Oculta el enlace al vencer, al abandonar la vista o ante errores de lectura. No lo incluye en eventos, auditorías ni documentación. La caché vive en la base local protegida y fuera de Git; su vencimiento lógico no constituye borrado forense de páginas SQLite ni de copias previas.

Referencia: https://whapi.readme.io/reference/getgroupinvite (2026-09-27). La disponibilidad depende de permisos del grupo y de WhatsApp. No se declara equivalencia completa ni garantía de acceso.

Validación: las tres pruebas específicas de worker/API aprobaron, con revisión independiente. Chrome mostró la tarjeta administrativa y su botón en un grupo conocido, sin código presente ni errores. No se solicitó un enlace real; la compatibilidad con la respuesta de esta cuenta queda pendiente. No se incluyeron invitaciones en informes ni capturas.
