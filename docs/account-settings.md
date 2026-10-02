# Ajustes de cuenta recibidos

El worker escucha pasivamente `settings.update` y el campo explícito `accountSettings.unarchiveChats` de `creds.update`. Solo persiste idioma, formato de 24 horas, retransmisión de llamadas, desactivación de previsualizaciones de enlaces, exclusión de recomendaciones personalizadas de canales y desarchivado de conversaciones. Contratos comprobados contra `baileys/lib/Utils/chat-utils.js`, `lib/Types/Events.d.ts` y las interfaces de `WAProto/index.d.ts` de la versión fijada.

Cada ajuste tiene snapshot independiente `account_setting`, valor escalar y `observed_at`. Los booleanos false se conservan; objetos vacíos, valores nulos, números y strings que simulen booleanos se rechazan. No se serializan credenciales, listas de privacidad, claves ni payloads arbitrarios. No se escribe un evento global para estos ajustes.

`GET /api/v1/account` añade `observed_settings`, disponible exclusivamente a sesiones administrativas. Los tokens read y el endpoint genérico de snapshots no permiten recuperarlos. En **Mi cuenta → Ajustes recibidos de WhatsApp**, el panel presenta fecha por ajuste y advierte que el último valor recibido no prueba vigencia actual ni exhaustividad. No hay controles para modificar estos ajustes. Actualizar perfil no fuerza su recepción.

Los datos aparecen solo si WhatsApp entrega el evento. No se infieren desde otros ajustes ni desde credenciales históricas. Esta función amplía las variables locales observadas, sin declarar equivalencia con campos WHAPI no comprobados. El estado de bloqueo de conversaciones no se incorporó en esta entrega.

Validación: suite completa 267/267, build aprobado y 11/11 pruebas focales posteriores al añadido de aislamiento HTTP. Las pruebas no conectan con WhatsApp ni cambian configuración real.
