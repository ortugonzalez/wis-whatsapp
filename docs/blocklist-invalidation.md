# Frescura de la lista de bloqueos

El evento pasivo `blocklist.update` de Baileys invalida el snapshot anterior de bloqueos. No agrega ni quita identificadores: un evento incremental no acredita la lista completa. No se guardan sus destinos en un registro adicional. Si todavía no existe lista guardada, no se crea una lista vacía ficticia.

El worker compara una revisión local antes/después de la lectura de lista. Si llega una notificación válida durante la consulta, descarta ese resultado como fuente vigente y conserva los identificadores y fecha de éxito anteriores. Solo una lectura posterior sin cambios concurrentes vuelve a marcar el snapshot como verificado. Este control no garantiza ausencia de eventos perdidos durante desconexiones.

`GET /api/v1/blocklist` sigue siendo exclusivo del administrador. Su metadata prioriza `collection_status:stale`, añade `stale_reason` (`passive_blocklist_change` o `change_during_read`) y `last_invalidated_at`. El panel indica “Lista pendiente de actualización” en lugar de “Consulta completada”. El último éxito no cambia al recibir la notificación. No se acelera la agenda ni se encola un reintento automático adicional; la siguiente lectura existente puede renovar la lista.

Contrato fuente: `baileys/lib/Socket/messages-recv.js` emite `blocklist.update`; solo se aceptan tipos add/remove y JIDs de usuario válidos. No se realizan bloqueos, desbloqueos, envíos ni cambios de permisos.

Pruebas cubren notificación antes de primera lectura, preservación de lista y fecha anterior, inputs inválidos, carrera dentro del getter real del worker, recuperación con una lectura posterior y metadata de la API. La prueba de carrera usa SQLite en memoria y un socket simulado.

Validación 2026-10-02: 272/272 pruebas completas, build y QA independiente aprobados. EasyPanel desplegó `6af04bb` correctamente a las 14:31 UTC. Chrome confirmó conexión conservada y actividad posterior al reinicio. No se provocó un cambio real en bloqueos: la invalidación se verificó con pruebas aisladas, no se afirma haber recibido un evento productivo. Próxima ruta: revisar los eventos de eliminación de chats y su representación como historial observado, sin borrar mensajes locales automáticamente ni confundirlos con bajas de contactos.
