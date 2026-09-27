# Cuotas y restricciones reportadas por WhatsApp

Este módulo muestra respuestas del proveedor sobre cuota de nuevos chats y restricciones temporales de la cuenta. No es un cálculo de riesgo de suspensión ni una cantidad recomendada de envíos. Ningún valor modifica los límites comerciales, el consentimiento o la pausa de envíos de WIS.

La consulta es manual y administrativa, sobre la cuenta ya vinculada. El panel consulta luego los resultados guardados en SQLite. Una respuesta ausente o malformada significa información desconocida, no cuota cero ni ausencia de restricciones.

Baileys 7.0.0-rc14 declara `fetchNewChatMessageCap` y `fetchAccountReachoutTimelock`. El segundo normaliza una respuesta ausente a valores predeterminados; WIS debe validar la respuesta original antes de interpretar `is_active`. Sólo se conservan campos permitidos y errores sanitizados. Las fechas deben distinguirse de unidades y valores no confirmados por el proveedor.

La disponibilidad de estos datos no garantiza que WhatsApp permita contactar destinatarios ni elimina el riesgo de usar una integración no oficial.

Validación 2026-09-27: 40 pruebas locales y build aprobados, revisión independiente de API, worker e interfaz. La consulta real administrativa desde Chrome devolvió ambas secciones disponibles sin error; la interfaz mostró dos respuestas verificadas. Los valores concretos se mantienen en el panel privado, no en este informe. Se conservaron sesión y políticas de envío. La cobertura WHAPI sigue siendo parcial y el siguiente refresco requiere acción manual.
