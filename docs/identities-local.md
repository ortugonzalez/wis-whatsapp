# Identidades de WhatsApp: LID y número

WhatsApp puede entregar un identificador `@lid` en lugar de un identificador basado en el número (`@s.whatsapp.net`). Los dígitos de un LID no son un teléfono y no se convierten en uno.

WIS conserva las correspondencias que la sesión efectivamente recibe. La vista y la API consultan únicamente datos locales: no buscan números arbitrarios en WhatsApp ni garantizan resolver todos los contactos. Una identidad sin correspondencia se muestra como desconocida; un conflicto debe permanecer explícito.

Conocer una correspondencia no constituye consentimiento comercial. Este módulo no fusiona autorizaciones, bajas ni conversaciones y no habilita envíos. Los identificadores completos sólo deben consultarse en el panel autenticado o mediante un token con permiso de lectura; no deben copiarse a informes de QA.

Los eventos y fixtures se validan sin provocar mensajes, llamadas ni cambios de cuenta. La cobertura se considera parcial respecto de los métodos de resolución de identidades de WHAPI.

`GET /api/v1/identities` exige permiso `read`. Admite búsqueda, paginación y filtros `lid` y `pn`; `id` permite consultar un registro. Los contactos con un único identificador se incluyen con estado desconocido. Los PN candidatos de un conflicto son evidencia, no destinos autorizados de envío.

El worker recupera pares explícitos de los snapshots de contactos anteriores al incremento cuando obtiene la propiedad de la conexión. Conserva la fecha del snapshot como evidencia local y evita reimportar el mismo par. No lee archivos de credenciales para construir este inventario.

Validación del 2026-09-27: 36 pruebas locales y 13 de QA aprobadas, build válido y revisión cruzada independiente. Chrome mostró 451 registros locales; la base no contenía todavía pares explícitos recuperables, por lo que no se declara que esos registros sean correspondencias LID/PN confirmadas. Conflictos y recuperación de pares se verificaron con fixtures. La conexión volvió a estar activa tras reiniciar y las operaciones salientes permanecieron en cero.
