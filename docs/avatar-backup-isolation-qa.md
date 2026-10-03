# Fotos y respaldo SQLite — 2026-10-03 07:07 UTC

Frente 5: QA de persistencia, sin restauración productiva ni nuevas solicitudes
a WhatsApp. Worktree inicialmente limpio. EasyPanel mantiene último despliegue
del resumen de fotos; API pública de estado HTTP 200 connected, error nulo.
Inspección local: cero Node con local/worker.mjs en comando; esto no sustituye
la verificación de procesos remotos.

## Evidencia productiva nueva

Consulta explícita de resumen en Chrome a las 04:08 BA: 954/954 destinos,
15 con caché y disponibilidad declarada, 8 sin archivo válido, 931 sin foto
recolectada, resto cero. Frente a la comprobación de 03:55 BA aumentó un archivo
en caché y disminuyó uno no recolectado. No atribuimos esto a recepción de
mensajes ni afirmamos vigencia remota. La consulta no encola lecturas WA.

## Prueba de restauración aislada

Se extendió `local/restore-api-smoke.test.mjs` con un JPEG mínimo sintético en
directorio de origen y snapshot con metadata de disponibilidad. Una copia
SQLite se abre en otra instancia API de prueba, con almacenamiento separado,
worker/envíos/webhooks deshabilitados exclusivamente para esa prueba.

El verificador declara avatars_included=false. Tras restaurar solo SQLite:
snapshot presente, no_cached_file=1, cached_current=0, not_collected=0;
metadata individual observed=true, cached=false, available=false y content_url
nulo. Los bytes de origen permanecen intactos. No se procesa cola ni se encolan
lecturas. Esto verifica detección de la ausencia, no recuperación de fotos.

Owner: 8/8 pruebas enfocadas de backup/restore/API. QA independiente: 1/1
prueba de restauración, PASS sin modificaciones. No cambia código productivo,
por lo que no se despliega este turno. El respaldo SQLite sigue excluyendo
archivos de avatar, multimedia y sesión; recuperación productiva integral y
copia externa siguen sin verificarse.

## Próxima ruta

Frente 2: revisar cobertura de campos Business por contacto usando snapshots
verificados y sus estados de error/obsolescencia. No inferir is_business a partir
de verifiedName, ni false por perfil ausente. Si no hay equivalencia demostrable,
documentar brecha y pasar a otra fuente disponible, sin repetir lecturas remotas.
