# Nombre de libreta frente a etiqueta local

2026-10-03, ejecución 04:37 UTC. Ruta 2: corregir procedencia de campos antes de ampliar equivalencias.

Producción inspeccionada en Chrome: 977 display_name normalizados frente a 32 snapshots contact.name con texto no vacío, dentro de 977 snapshots de contactos. No se leyeron los nombres. EasyPanel mantiene el despliegue del diagnóstico; el último lote del socket sigue sin observación disponible. No se reinició ni se solicitó sincronización.

El worker crea contactos con `name || phone || id`, y en recepción también usa pushName o teléfono/JID como respaldo visual. Por eso display_name no basta para acreditar el campo name de WHAPI como nombre de libreta. También puede corresponder a datos importados o de presentación local.

Se cambiaron únicamente las equivalencias `getcontacts.contacts[].name` y `getcontact.name` para usar `contact.name` con texto no vacío. No se modificaron registros ni su presentación en la agenda. El nombre push y nombre comercial permanecen separados. La fecha y marca obsoleta se toman de la evidencia del snapshot, no de la fecha del cálculo.

Pruebas focales owner 23/23 PASS, con referencia pública guardada y comparador real: solo display_name no acredita name, campo vacío tampoco y un nombre observado obsoleto acredita disponibilidad histórica sin declararlo fresco. No se espera necesariamente bajar el total de rutas productivas, porque ya existen nombres reales; sí se corrige su procedencia y su cantidad de respaldo. No se afirma paridad.

QA independiente 2/2 PASS. Se ajustó el título de la prueba a los escenarios que efectivamente ejecuta, conforme a la observación menor de revisión. Diff sin errores; cambio aún local, pendiente de despliegue.

Próxima ruta: integrar las dos correcciones de nombres en un paquete revisado y verificar los conteos productivos. Luego auditar fecha/semántica de teléfono y mapeos PN/LID sin inferir identidad desde cifras. El tráfico sigue bajo observación pasiva.
