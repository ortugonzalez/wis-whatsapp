# Estado de configuración de envíos

La vista general utiliza el booleano `connection.outbound_enabled` recibido de la API para ambos indicadores y los actualiza en cada polling. Distingue habilitado por configuración, deshabilitado y no informado. No afirma que la cuenta esté lista para enviar ni que una operación se haya entregado. La bandeja de solo lectura explica que esa vista no ofrece envío, sin atribuirlo incorrectamente a una pausa global.

`POST /api/v1/messages` devuelve el flag actual junto a la operación recién aceptada y en los replays idempotentes. Antes devolvía un `false` fijo al aceptar una operación. El estado de la operación sigue siendo la evidencia de procesamiento; no se cambia el consentimiento, los permisos ni los controles de idempotencia. Un replay puede devolver una operación existente aunque después se haya deshabilitado el envío; informa la configuración actual sin volver a encolarla.

Pruebas con base sintética y sin worker: aceptación habilitada, rechazo deshabilitado y replay tras deshabilitar sin duplicar operaciones. Prueba de interfaz: ambos indicadores recorren habilitado, deshabilitado y desconocido mediante polling. QA independiente aprobó 10 pruebas focales. Esta entrega no modifica variables de producción ni ejecuta mensajes de prueba.

La suite completa terminó con 278/278 aprobadas. En una ejecución anterior falló una prueba preexistente del plazo del catálogo (esperaba iniciar dos páginas en 120 ms y alcanzó una); pasó al ejecutarla aislada y al repetir la suite, sin cambiar ese código ni su prueba. Conservar esa observación como sensibilidad temporal bajo carga, no como defecto resuelto por este cambio.
