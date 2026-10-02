# Etiquetas de miembros recibidas

El worker conserva eventos pasivos `group.member-tag.update` con grupo, participante, identidad alternativa si existe, etiqueta, timestamp de mensaje y fecha de recepción. No consulta grupos adicionales, modifica participantes, emite mensajes ni concede permisos. Cada par grupo/participante mantiene la última notificación recibida, no un estado actual garantizado.

Contrato comprobado en `baileys/lib/Types/Events.d.ts` y `lib/Utils/process-message.js`: el protocolo `GROUP_MEMBER_LABEL_CHANGE` solo emite el evento cuando `memberLabel.label` es truthy. Por tanto, no se interpreta ausencia o silencio como eliminación de etiqueta. Un evento histórico recibido después puede reemplazar la última notificación; se conserva su timestamp separado y no se presenta como actualización cronológica garantizada.

La API autenticada `GET /api/v1/groups?id=...` añade `observed_member_tags` con `items`, `truncated`, `complete:false` y `scope:received_events_only`. Solo devuelve filas del grupo solicitado y como máximo 500, ordenadas por fecha de guardado. La consulta requiere que ya exista un snapshot del grupo. El detalle del grupo muestra una tabla de etiquetas y fecha de recepción; no modifica la lista de participantes ni trata la etiqueta como rol administrativo.

Se rechazan identidades inválidas, etiquetas vacías, controles y textos de más de 256 caracteres. Las propiedades extra no se guardan. No se fusionan las identidades alternativas ni se inventan etiquetas ausentes. Esta observación no se mapea automáticamente al catálogo WHAPI sin equivalencia revisada de contrato.

Validación 2026-10-02: 269/269 pruebas, build y QA independiente aprobados. EasyPanel desplegó `80eba5a` correctamente a las 14:11 UTC. Chrome verificó la sección nueva en un detalle ya almacenado, sin pedir actualización de grupo: no había etiquetas recibidas para ese grupo. No se afirma recepción productiva de este evento ni ausencia de etiquetas en WhatsApp. Próxima ruta: revisar eventos de bloqueo de conversaciones y su interacción con el modelo de visibilidad antes de capturarlos; no presentarlos como bloqueo de contactos.
