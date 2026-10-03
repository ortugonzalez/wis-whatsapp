# Tarjeta de fotos — 2026-10-03 06:52 UTC

Frente 4. Producción inicialmente en despliegue visual previo, lease vigente,
snapshot más reciente 03:44 BA y fecha de último entrante origen live sin cambio.
Se integró la API revisada mediante tarjeta de consulta explícita en overview.
No agrega polling ni llamadas WhatsApp. Distingue siete categorías, muestra
muestreo parcial, checked_at y límites de firma/frescura. Navegación invalida
respuestas tardías y pulsaciones concurrentes no duplican solicitudes.

Owner: 7/7 pruebas enfocadas API/agregado/UI. Suite general del backend anterior
310/310; nuevos tests UI 2/2 también ejecutados por qa_ops, revisión PASS.
Chrome confirmó DOM y consulta; su captura agotó tiempo, por lo que se usó
navegador integrado con la misma fixture sintética: tarjeta legible, categorías
y limitaciones completas. Captura ignorada `.local/avatar-card-preview.png`.
Fixture cerrada y servidor detenido; no worker iniciado.

Antes de desplegar: Chrome mostró 0 sending y 0 pending. No se cambian flags,
credenciales, permisos o programación. No añade paridad WHAPI.

## Verificación productiva

Un despliegue, EasyPanel Success 2026-10-03 06:54:53 UTC. Chrome recibió la
tarjeta y su consulta real: 954/954 destinos, 14 caché con disponibilidad declarada,
8 sin archivo válido, 932 no recolectados; las demás categorías en cero. Estos
conteos de destinos no son los 980 registros de contactos ni personas únicas.
La firma y vigencia remota siguen sin comprobarse. No se hizo nueva lectura WA.
Captura de recorte agotó tiempo; ruta alternativa de viewport tras enfocar tarjeta
funcionó. Evidencia ignorada `.local/contact-avatar-production.png`.

Próxima ruta: QA de persistencia/backup de avatars (frente 5). Verificar que las
herramientas de respaldo declaren correctamente exclusiones y no presenten la
caché como recuperable cuando no va en el respaldo, sin ejecutar restauraciones
ni modificar producción. Cobertura WHAPI permanece incompleta.
