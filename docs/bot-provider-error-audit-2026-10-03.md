# Diagnóstico de bots — 2026-10-03 11:07 UTC

## Evidencia productiva nueva

EasyPanel mantiene el despliegue de roles de participantes de las 10:56:28 UTC. En Chrome, WhatsApp sigue conectado con identidad verificada y lease vigente; última escritura de snapshot 08:06 Buenos Aires. El temporizador de mensajes terminó su comando encolado a las 08:00; próxima ruta indicada: subgrupos de comunidades a las 08:15. Continúan 84 fallos acumulados, 29 tipos y 443 campos listados.

La tarjeta de bots en Mi cuenta confirma para el intento automático de las 07:44 Buenos Aires: provider_error, código 500, ninguna respuesta exitosa registrada y cero registros locales. Esto no prueba que la cuenta carezca de bots ni que haya fallado la sesión de WhatsApp. Los 14 entrantes live mantienen la fecha del último mensaje del 2 de octubre a las 12:06 Buenos Aires; no hay evidencia nueva de recepción.

## Contraste con implementación

`checkedBotList` emite IQ GET, namespace bot, destino de servicio WhatsApp y versión 2. Coincide con `getBotListV2` del paquete Baileys instalado (`lib/Socket/chats.js`). La diferencia deliberada es la validación estricta de la respuesta y la preservación del código de error; no se transforma una respuesta faltante en una lista vacía.

La respuesta fallida se guarda con available false y stale true. La cobertura no debe contar campos diagnósticos o identidades ajenas como campos de bots. Las pruebas focales bot-list y bot-field-coverage pasaron 2/2 sin llamadas remotas.

La agenda aplica recuperación de seis horas específicamente a read_timeout. Un provider_error 500 no activa esa regla; la ruta vuelve a ser elegible en una vuelta posterior del ciclo normal. Esto explica la recurrencia sin demostrar su causa remota. No se cambió el calendario, el criterio de recuperación ni el protocolo. No se reintentó la consulta ni se abrió otro worker.

## Límite y próxima ruta

El código 500 no permite atribuir la causa a permisos, tipo de cuenta o una caída general del proveedor. No hay evidencia que justifique reintentar manualmente el mismo camino. Continuar con inventario de campos de mensajes a partir de agregados ya guardados, diferenciando campos ausentes, tipos y frescura. El fallo de bots permanece documentado como brecha; no bloquea ese análisis independiente ni requiere una acción del usuario ahora.
