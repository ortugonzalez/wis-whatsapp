# Evidencia de nombres push de contactos

2026-10-03, ejecución 04:22 UTC. Ruta 2, independiente de bots/catálogo y sin nuevas consultas a WhatsApp.

Chrome productivo conserva la implementación de diagnóstico. El último lote del socket permanece sin observación disponible. En el inventario agregado de contactos: 977 snapshots, 32 con campo name, 434 con notify y 65 con status.status, de los cuales 35 contienen texto no vacío. La tabla normalizada lista 977 display_name y 222 phone_e164; esos conteos no prueban que todos los nombres sean nombres públicos actuales. No se leyeron valores de contactos.

Se encontró una diferencia entre contratos de cobertura: getcontacts/getcontact ya exigen texto no vacío para el nombre push, pero getcontactprofile.push_name aceptaba la mera presencia de notify. Se agregó el mismo requisito a esta equivalencia, sin cambiar datos, lecturas, permisos o endpoints. El nombre propio de la cuenta no satisface el campo de un contacto. La evidencia marcada obsoleta sigue contándose como obsoleta, no fresca.

Owner: 47/47 pruebas focales aprobadas, usando la referencia WHAPI guardada y el comparador real. Los escenarios cubren presencia vacía, texto no vacío, marca obsoleta y recurso incorrecto. No se promete incremento de cobertura: el cambio evita falsos positivos en cuentas cuyos notify solo contienen texto vacío.

QA independiente: 1/1 PASS, sin hallazgos; diff sin errores. No se amplió testing fuera de las suites relacionadas porque el cambio solo agrega una condición de evidencia a una equivalencia.

Pendiente desplegar junto a otro paquete pertinente. Próxima ruta: revisar la semántica del display_name normalizado y sus valores de respaldo antes de equipararlo con nombres informados por WhatsApp. El worker confirma que al crear contactos usa nombre o, en ausencia, teléfono o JID como respaldo; la cantidad normalizada no demuestra nombres reales. Conservar distinción entre dato de libreta, nombre push, nombre comercial y metadatos propios de WIS. No afirmar paridad ni inventario completo.
