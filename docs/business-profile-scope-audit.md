# Alcance de perfiles Business — 2026-10-03 07:22 UTC

Frente 2. Worktree inicialmente limpio; EasyPanel mantiene despliegue del resumen
de fotos. Chrome: lease vigente, identidad verificada, snapshot más reciente
04:15 BA, último entrante origen live con fecha 2/10 12:06 BA. Esto no demuestra
recepción reciente. Se inspeccionaron solo nombres de campos, conteos y fechas.

## Contactos y cuenta propia

Inventario productivo: 69/980 snapshots contact con sección business_profile;
los 69 contienen error y no se observan rutas wid/description/business_hours
en esa sección. La presencia de available o response_verified no indica que
sean true. No puede derivarse is_business=true ni false de estos agregados.
El worker solo valida respuesta Business de contacto si wid coincide con destino
PN; ausencia, error o destino LID quedan sin respuesta correlacionada. Un fallo
posterior conserva campos previamente verificados, marcándolos obsoletos.

El snapshot business de cuenta propia contiene un registro con wid, descripción,
categoría y horarios; última escritura/éxito 03:55 BA. No se copiaron sus valores.
Son ámbitos distintos y no deben prestarse cobertura entre sí.

## Corrección local

La [documentación oficial de WHAPI](https://whapi.readme.io/reference/getbusinessprofile)
define GET /business como consulta del perfil Business propio. Verificado el
3/10/2026. El catálogo local coincide con ese endpoint, sin ContactID.
Se retiraron dos aliases que permitían usar horarios de un contacto para cubrir
hours y hours.config de esa respuesta. source_kinds ahora admite solo business,
impidiendo también coincidencias exactas procedentes de contactos.
No se cambian los snapshots, el recolector ni los datos visibles de contactos.

Prueba con referencia real: perfiles contact por sí solos aportan cero campos
al método; business propio sigue aportando los dos contenedores de horarios.
Owner: 36/36 pruebas enfocadas aprobadas. No desplegado en esta ejecución.
QA independiente PASS, prueba nueva 1/1. Suite completa `rtk npm test`: 313/313
aprobadas. Inspección local: cero procesos Node con local/worker.mjs en comando;
no se inició otro worker. `git diff --check` sin errores.

## Próxima ruta

Cerrar QA y publicar corrección de alcance junto con próxima mejora pertinente.
Revisar después unidades/tipos de horarios: referencia declara openTime y
closeTime numéricos, mientras inventario productivo observa texto. No afirmar
compatibilidad exacta ni transformar unidades sin contrato verificado.
No se solicitaron perfiles nuevos ni se alteró programación, sesión o permisos.
