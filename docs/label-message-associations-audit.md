# Asociaciones de etiquetas por mensaje

2026-10-03, ejecución 02:07 UTC. Ruta 5: evidencia independiente de persistencia, antes de ampliar la API.

El worker recibe `labels.association`, conserva de forma acotada los campos permitidos y distingue asociaciones del chat (`label_jid`) y del mensaje (`label_message`). La API GET `/api/v1/label-associations` actualmente filtra únicamente asociaciones activas del chat. La persistencia de eventos por mensaje no implica que estén disponibles en ese endpoint ni que exista paridad con WHAPI.

Se amplió la prueba simulada del worker para demostrar: agregar dos asociaciones de mensajes y una del chat; quitar una del mensaje sin alterar las otras; eliminar la etiqueta y desactivar las tres; impedir que un evento tardío vuelva a activar la etiqueta eliminada. Las comprobaciones existentes de ausencia de secretos y de escrituras al socket siguen aplicándose.

Validación del owner: worker 46/46 y backend/cobertura 34/34 PASS. QA independiente: worker 46/46 PASS, sin cambios de código ni servicios reales. No se modificó comportamiento productivo ni se ejecutó una consulta nueva a WhatsApp.

Chrome productivo: Etiquetas sin filas y con aviso de datos no recopilados. EasyPanel conserva como última implementación la corrección de fechas de mensajes. La falta de asociaciones visibles no demuestra inexistencia en WhatsApp; tampoco permite atribuir asociaciones reales por mensaje. El endpoint público de estado respondió HTTP 200; esto por sí solo no demuestra recepción reciente.

Próxima ruta: diseñar filtro explícito por tipo en la API y selector del explorador, conservando por defecto el contrato de asociaciones de chat. Documentar alcance, baja y frescura antes de habilitarlo. No asignar campos de mensajes completos WHAPI a una asociación que solo contiene referencias. Recuperación productiva completa y paridad siguen pendientes.
