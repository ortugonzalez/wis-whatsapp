# Límites propios de la instalación

`GET /api/v1/limits` es una lectura administrativa de los límites técnicos del servidor WIS. La pantalla Configuración muestra tamaños de solicitudes y archivos, longitud del texto, paginación e historial solicitado, junto al estado de habilitación de envíos y webhooks. Las constantes compartidas alimentan tanto la respuesta como las validaciones correspondientes del servidor.

Estos límites no expresan cuántos mensajes es seguro enviar, no garantizan aceptación por WhatsApp y no habilitan funciones. Las cuotas y restricciones que realmente informa WhatsApp permanecen en Mi cuenta, mediante `/account-limits`, con su propia disponibilidad.

La función WHAPI `getlimits` describe consumo y saldo de canales sandbox/trial: https://whapi.readme.io/reference/getlimits (consultada 2026-09-27). Esa facturación pertenece a WHAPI y no tiene equivalente en esta instalación. Por eso figura como no soportada; `/limits` se documenta como alternativa operativa propia, sin sustituir el contrato comercial externo.

Validación: pruebas de bordes y worker 25/25, regeneración de matriz 4/4 y revisión independiente aprobadas. Chrome mostró 15 MiB para JSON, 10 MiB de carga multimedia, 200 registros por página y 50 mensajes solicitados por historial, con envíos y webhooks deshabilitados. La sesión se conservó al cargar la versión.
