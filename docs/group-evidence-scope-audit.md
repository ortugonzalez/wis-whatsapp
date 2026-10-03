# Auditoría de grupos — 2026-10-03 10:37 UTC

## Evidencia productiva

Chrome mantiene el despliegue b7dcd4a. Sesión conectada con identidad verificada y lease vigente; última escritura de snapshot 07:37 Buenos Aires. El comando programado de fotos de perfil terminó; siguiente ruta indicada: bots de la cuenta a las 07:44. Se mantienen 83 fallos acumulados, 29 tipos y 443 campos listados. Los 14 entrantes de origen live conservan como última fecha de mensaje el 2 de octubre a las 12:06 Buenos Aires: no hay evidencia nueva de recepción reciente.

Get group muestra 29/759 rutas observadas, 29 sin marca obsoleta y 730 sin observar. El denominador incluye el esquema anidado de mensajes; no son 759 atributos básicos del grupo ni una medida de paridad funcional.

En la tabla productiva, `id` se respaldaba simultáneamente en 568 chats, 568 conversaciones y 18 grupos. La coincidencia con chats o conversaciones genéricos no prueba que esos registros sean grupos. `getgroups.groups[].id` ya estaba limitado al recurso group; faltaba el mismo alcance para getgroup.

Participantes: `size`, `participants`, `participants[].id` y `participants[].admin` aparecen en 18/18 snapshots de grupo, guardados a las 07:23 Buenos Aires. Son conteos de snapshots con evidencia, no cantidades de participantes ni prueba de que todos sus elementos estén completos. No se consultaron identificadores ni valores personales.

El catálogo local exige rank entre admin/member/creator; Baileys declara admin/superadmin/null. La equivalencia de disponibilidad de rol no es igualdad del enum: una futura respuesta compatible debe traducir y validar cada elemento, sin convertir un campo ausente en member. Esta vuelta no implementa ni afirma esa paridad.

## Corrección local revisada

Se limita `getgroup.id` a evidencia de snapshots group. Una prueba usa el catálogo real y agregados sintéticos para comprobar API y tabla en tres casos: ausencia de grupos con chats presentes, grupo vigente y grupo obsoleto con chats vigentes. Los chats no satisfacen ni rejuvenecen el campo.

Owner: 36/36 pruebas focales y 323/323 suite completa. QA independiente: 1/1, sin hallazgos. Sin cambios del worker, del esquema SQLite, de permisos ni de programación. No hubo lecturas remotas manuales ni envíos.

La corrección está preparada localmente; no se desplegó en esta vuelta. La producción sigue en b7dcd4a. Se conserva para agruparla con la siguiente corrección pertinente y evitar reemplazar el servicio por cada ajuste de auditoría.

## Próxima ruta

Revisar el contrato de proyección de roles de participantes y su cobertura por elemento, usando los snapshots existentes y fixtures sintéticos; no solicitar otra lectura de grupos. Si aparece una mejora pertinente, probarla y revisarla antes de desplegar junto con esta corrección. Mantener separadas disponibilidad, compatibilidad del enum y frescura real.
