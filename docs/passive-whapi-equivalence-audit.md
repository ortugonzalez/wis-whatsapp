# Auditoría de equivalencias pasivas — 2026-10-02

Se contrastaron las nuevas observaciones con `public/whapi-fields.json` (captura 2026-10-01) y la tabla de aliases realmente consumida por el auditor. La referencia pública `https://whapi.readme.io/reference/getchannelsettings` fue accesible; la variante `.md` no respondió mediante el navegador de investigación. No se atribuye a esa visita una nueva descarga del esquema completo.

## Equivalencias que no se acreditaron

| Campo WHAPI | Dato local candidato | Resultado |
|---|---|---|
| getchannelsettings.locale | account_setting de tipo locale | Sin equivalencia acreditada. El endpoint `/settings` es configuración del servicio WHAPI (incluye callback, proxy y modo de datos); el evento Baileys es un ajuste sincronizado de WhatsApp. |
| getgroup.participants[].rank | group_member_tag.label | No equivalente. rank enumera admin/member/creator; label es un texto libre recibido y no concede ni describe necesariamente un permiso. |
| getmessagesnewsletter.messages[].reactions[].count | newsletter_reaction.reported_event_count | No equivalente. Baileys genera 1 al procesar la notificación; no hay evidencia de que sea el agregado del mensaje que devuelve WHAPI. |
| getmessagesnewsletter.messages[].reactions[].unread | recepción de newsletter.reaction | Sin fuente local verificada. Recibir la notificación no prueba el estado de lectura de una reacción. |

No se incorporaron aliases ni se aumentó cobertura por estas observaciones. La prueba nueva usa la tabla real de aliases y comprueba que ni nombres iguales presentes en tipos de snapshot distintos producen una observación falsa para esos cuatro campos.

El contrato WHAPI inventariado para getgroup no incluye una etiqueta de miembro dentro de participants: allí figuran id y rank. Las etiquetas recibidas siguen siendo datos útiles propios de WIS; no reemplazan un campo de permisos.

## Próxima ruta

Revisar la frescura de la lista de bloqueos frente a `blocklist.update`: un evento incremental puede invalidar una lista anterior sin justificar reconstruir una lista completa. Primero comprobar que el panel y la API distinguen explícitamente snapshot verificado, snapshot obsoleto y ausencia de consulta. No realizar cambios en la lista de bloqueos ni volver a intentar el catálogo fallido.

Inspección de código completada: Baileys emite `blocklist.update` desde `messages-recv.js`; el worker no lo escucha actualmente. La API `/blocklist` ya expone `stale`, pero calcula `collection_status` principalmente a partir de available/truncated/response_verified. Esta evidencia prioriza invalidación pasiva y coherencia del estado presentado, sin reconstruir la lista a partir de notificaciones aisladas.

Validación: revisión independiente aprobada y 21/21 pruebas de aliases correctas. Esta entrega modifica pruebas y documentación, sin cambiar el runtime, desplegar ni reiniciar la conexión.
