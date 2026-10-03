# Teléfonos y correspondencias PN/LID

2026-10-03, ejecución 04:52 UTC. Ruta 2/5 de solo lectura, independiente de bots/catálogo.

Chrome productivo: 222 contactos normalizados tienen phone_e164 y hay 3749 snapshots de identidad con rutas lid, pn y candidate_pns. La presencia de un campo conflict en 3749 filas no indica 3749 conflictos: el inventario cuenta presencia, no valores booleanos verdaderos. No se leyeron identificadores ni teléfonos. EasyPanel conserva la implementación del diagnóstico y el último lote continúa sin observación disponible.

El worker extrae el teléfono normalizado del dominio PN s.whatsapp.net, valida los dígitos y conserva nulo para un LID sin par explícito. El registro de pares valida ambos formatos, conserva fuentes, detecta un PN asignado a varios LID o cambios de PN y marca conflicto; no fusiona consentimiento ni reemplaza silenciosamente otro teléfono conocido.

La API de identidades expone el PN retenido junto con status/conflict y candidatos. También detecta colisiones entre candidatos al leer. Un consumidor no debe interpretar phone_e164 de una fila conflict como correspondencia inequívoca. Un contacto sin par explícito queda unknown: el número de su LID no se convierte en teléfono.

Brecha de cobertura identificada: las equivalencias getlidbyid/getidbylid actualmente usan presencia de lid/pn en snapshots de identidad sin excluir conflictos. Eso acredita disponibilidad histórica de valores, pero puede parecer una correspondencia inequívoca. No se modificó todavía la API ni se decidió borrar la evidencia histórica; una proyección para pares inequívocos debe conservar los conflictos en el explorador y filtrarlos solo para esa equivalencia.

Validación: 3/3 pruebas focales existentes de identidad del worker aprobadas. QA documental independiente PASS, contrastado con código de worker, API y equivalencias. Sin cambios funcionales ni consultas productivas adicionales del revisor; diff sin errores.

Próxima ruta: definir contexto de cobertura para pares observados, válidos y sin conflictos, incluyendo detección de colisiones cruzadas y fechas. Agregar regresiones antes de cambiar aliases. Integrar luego con las correcciones de nombres; no pedir otra vinculación ni modificar contactos reales.
