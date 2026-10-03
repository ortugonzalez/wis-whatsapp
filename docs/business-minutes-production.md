# Horarios propios en producción — 2026-10-03 08:22 UTC

Frente 4 completado para la corrección acotada de cobertura. Worktree limpio al
inicio. Producción conservaba lease vigente y snapshot general 05:15 BA. Cola
verificada sin operaciones pending ni sending antes del despliegue.

Se verificó visualmente una tabla sintética con las notas reales del alias y CSS
del proyecto, sin base ni worker: la columna de evidencia mantiene lectura y
desplazamiento horizontal. El servidor temporal se cerró. Un primer comando para
crear el fixture falló por quoting de PowerShell; se reemplazó por archivo escrito
con apply_patch, sin repetir el comando defectuoso.

Se publicaron los cambios ya revisados y probados (317/317 pruebas completas y QA
independiente), incluida la separación del perfil propio frente a contactos.
Push únicamente al remoto production. Un único despliegue EasyPanel, terminado
con Success a las 08:23:49 UTC. Sin nuevas vinculaciones, cambios de configuración
ni reinicios manuales de workers.

## Evidencia productiva

En Chrome, getbusinessprofile muestra 8/12 campos observados. openTime y closeTime
aparecen como number con equivalencia semántica business_minutes, ambos 1/1;
snapshot guardado 05:23 BA. Se muestra límite de 28 filas y originales preservados.
No se leyeron ni registraron valores privados de horarios. Captura local ignorada:
.local/business-minutes-production.png.

Tras publicar: conectado, identidad verificada, lease vigente, 440 campos listados,
29 tipos de snapshots, última escritura 05:24 BA. Último entrante almacenado origen
live sigue 2/10 12:06 BA (14 registros); no prueba recepción reciente. La sesión
persistió sin intervención del usuario. El dashboard quedó abierto en Vista general.

## Próxima ruta

Frente 2/5: auditar las brechas restantes de getbusinessprofile (4/12) frente a
presencia real, tipos y enumeraciones, sin solicitar de nuevo lecturas agotadas.
En particular, revisar día/modo y ausencia de dirección/email/sitios sin inventar
datos. Paridad WHAPI, recepción reciente y recuperación productiva completa siguen
pendientes; este despliegue no demuestra que el producto esté listo como SaaS.
