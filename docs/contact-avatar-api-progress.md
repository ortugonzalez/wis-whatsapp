# API del resumen de fotos — 2026-10-03 06:37 UTC

Frente 4. Worktree inicialmente limpio; producción conserva despliegue visual
de 05:54 UTC. Chrome muestra lease vigente, conexión verificada y escritura de
snapshot 03:34 BA; última fecha de entrante origen live continúa 2/10 12:06 BA.
No se infiere recepción reciente ni se consulta la base local como producción.

## Cambio local

GET `/api/v1/contact-avatar-coverage` exige permiso read y reutiliza existingAvatar
para verificar caché privada. Límite 1000 destinos; conteos y partial explícitos.
Caché de respuesta por servidor durante 30 segundos con checked_at y TTL;
ninguna comprobación de disco añadida al polling actual de overview. El filtro
también excluye destinos de más de 150 caracteres, igual que la API de avatar.

Prueba de integración usa SQLite en memoria y archivos temporales: JPEG mínimo,
archivo ausente, vacío, MIME declarado incoherente, traversal, snapshot obsoleto,
contacto sin snapshot y contenido corrupto. Este último puede pasar metadata,
pero el endpoint de contenido rechaza la firma con 415, como indican los flags
del resumen. Autenticación: 401 sin sesión, 403 token solo send, 200 token read.
Cero comandos de lectura encolados. El cache conserva checked_at tras borrar
un archivo sintético; no se presenta como verificación instantánea.

Owner y QA independiente: cinco pruebas aprobadas. QA detectó prefijo /api/v1
duplicado en OpenAPI, corregido a path relativo `/contact-avatar-coverage`.
Sin despliegue, cambios de credenciales reales ni consultas WhatsApp.
Suite general `rtk npm test`: 310/310 aprobadas. Tras el ajuste de longitud,
pruebas enfocadas 5/5 aprobadas; revisión independiente final PASS, P2 cerrado.

## Próxima ruta

Tarjeta de dashboard con consulta explícita de este resumen: separar caché
actual según metadata, obsoleta, faltante y no recolectada; mostrar checked_at,
muestreo y límite de firma/frescura. Prueba visual, QA y despliegue conjunto.
No crear equivalencias WHAPI a partir de filenames ni declarar paridad.
