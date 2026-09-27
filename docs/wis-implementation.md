> Arquitectura actual: SQLite, sin Supabase ni Docker. Ver [manual SQLite](sqlite-local.md). El contenido anterior debajo es histórico.

# WIS WhatsApp — implementación local

status: approved

Objetivo aprobado por el usuario: sesión Baileys de la línea terminada en 5679, panel WIS y API compartida para Python/n8n. Una única sesión por conexión. Ningún envío real ni activación de automatizaciones en esta etapa.

## Decisiones

- Next.js 16 + React 19; worker Node/TypeScript independiente; Supabase local aislado.
- API `/api/v1`, tokens con permisos y alcance de conexión, idempotencia, webhooks firmados.
- Acceso local con contraseña; administrador creado por bootstrap y secretos guardados fuera de Git.
- Matriz pública de WHAPI con fecha, fuente y estado por método; no prometer funciones ni historial no entregados por WhatsApp.
- Consentimiento comercial y bajas; campañas apagadas hasta aprobación concreta.
- QA independiente antes de integración. Credenciales, QR, sesiones y logs sensibles no son evidencias compartibles.

## Límites de aprobación

Conectar por QR se solicitó expresamente. Envíos, cambios de perfiles/grupos, publicación de estados, activación de flujos y despliegue se preparan pero no se ejecutan. No existe garantía de evitar suspensiones con Baileys.
