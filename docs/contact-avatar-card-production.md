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
