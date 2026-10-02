# WIS Workspace — beta administrada

## Producto entregable

Una instalación dedicada por cliente: dominio HTTPS, contenedor, volumen, SQLite, credenciales Baileys, administrador, correo de recuperación y tokens propios. El panel incluye conversaciones, contactos, datos observados, integraciones HTTP, capacidades verificables y configuración del espacio. La navegación separa operación, negocio, integraciones/acceso y herramientas adicionales. “Mi espacio” permite personalizar el negocio y cambiar la contraseña verificando la actual; revoca otras sesiones y enlaces de recuperación, conservando el worker y los tokens de integración.

El modelo actual no es multiusuario ni multitenant dentro de una base. El identificador interno `wis-5679` se conserva como clave técnica para compatibilidad; no identifica un cliente entre instalaciones. No compartir una base o volumen entre clientes. Los tests demuestran rechazo de cookies entre dos bases, pero el aislamiento de contenedores, redes y almacenamiento debe verificarse en cada instalación real.

## Preparar una instalación nueva

`npm run workspace:prepare -- --slug cliente-demo --name "Cliente Demo" --suffix 4321 --domain cliente.example.com`

Genera `.local/provisioning/cliente-demo/compose.json` y una guía, sin desplegar ni copiar datos. El archivo es Docker Compose JSON válido; NO es una plantilla importable de EasyPanel. Para EasyPanel, crear una App nueva con el Dockerfile existente, copiar solo la configuración no secreta generada, asignar HTTPS hacia puerto 3010 y montar su volumen exclusivo en `/app/.local`. Para Docker Compose, configurar además un proxy HTTPS en la red del proyecto: no se publica el puerto al host.

Cada cliente comienza con base vacía, contraseña aleatoria propia y worker desactivado. Configurar SMTP y recuperación para ese cliente. El correo de soporte editable no modifica el de recuperación. Habilitar worker solo al incorporar su línea. `WIS_EXPECTED_PHONE_SUFFIX` valida cuatro dígitos como ayuda de configuración, pero la autorización de identidad siempre compara el número completo. Si la variable falta, conserva 5679 para no afectar la instalación existente.

La preparación incluye límites iniciales de 1 CPU, 1024 MiB y 256 procesos; concede 45 segundos al cierre. `--cpus` acepta 0.5 o enteros de 1 a 8; `--memory` acepta MiB enteros de 512 a 16384. En EasyPanel aplicar CPU/memoria en Recursos, ya que no importa este Compose. Son límites de contenedor, no cuotas de almacenamiento, garantía de capacidad ni aislamiento de red. Medir carga real por cliente antes de ajustar o comercializar capacidad. La instalación WIS existente no cambia al generar estos archivos. Referencia: [servicios Docker Compose](https://docs.docker.com/reference/compose-file/services/).

El nombre inicial se configura mediante `WIS_WORKSPACE_NAME` y luego se edita en el panel. No copiar `.env`, `.local`, `baileys-auth`, bases, tokens ni credenciales de WIS al cliente.

## Contrato añadido

- `GET /api/v1/workspace`: sesión administrativa, perfil y comprobaciones de identidad, conexión, lease, recuperación configurada y cantidad de tokens activos. “Recuperación configurada” no asegura entrega de correo. “Worker activo” solo prueba lease vigente.
- `PATCH /api/v1/workspace`: sesión administrativa y origen coincidente; `name`, `connection_name`, `support_email`. No permite cambiar flags, identidad, permisos ni credenciales.
- `POST /api/v1/password`: sesión administrativa y origen coincidente; `current_password`, `new_password` (12–256 caracteres). Verifica contraseña actual, limita intentos, revoca otras sesiones y reset tokens. No cambia credenciales de WhatsApp ni revoca tokens de API.

## Condiciones pendientes antes de venta general

Esta versión es beta administrada, no un SaaS autoservicio terminado. Faltan alta automática de clientes, equipos/roles, suscripciones y cobros, soporte con SLA, política contractual de retención/eliminación, exportación integral y proceso verificable de baja. El script de preparación no resuelve esas funciones.

Para cada cliente: comprobar almacenamiento persistente y exclusivo, backup externo cifrado, restauración probada y acceso privado de operación; configurar límites de recursos; validar recuperación de acceso y recepción real; acordar uso consentido. Las pruebas reales de mensajes requieren destinatario y contenido aprobados. La cobertura WHAPI sigue parcial y Baileys no garantiza evitar suspensiones. No ofrecer números de disponibilidad ni paridad sin evidencia.

## Despliegue existente

Auditoría de infraestructura del 2 de octubre de 2026: Chrome mostró un volumen persistente `whatsapp-data` montado en `/app/.local`, ninguna copia de seguridad de volumen configurada y únicamente `Local Disk` en el selector de proveedores. No se creó ni activó una programación. El siguiente paso de recuperación requiere un destino externo cifrado, configurar su acceso privado y ensayar una copia consistente de base, sesión y multimedia con propietario único. No considerar el disco local una solución de recuperación ante pérdida del servidor. La prueba de restauración local documentada en el runbook no sustituye esta evidencia de producción.

Actualizar el servicio WIS existente usando la misma rama, dominio, volumen y variables de conexión. No duplicar el worker ni desplegar otro servicio con su volumen. La actualización añade filas de configuración al guardar el perfil; no migra ni renombra las claves de mensajes/conexiones existentes.

## Validación de esta entrega

Suite completa: 262 pruebas aprobadas. Build sintáctico aprobado. Revisión independiente de autenticación, aislamiento y preservación de sesión sin bloqueantes. Chrome: guardado del perfil en una base efímera, navegación agrupada y pantalla Mi espacio comprobados en escritorio y viewport móvil de 390 × 844. Las pruebas no enviaron mensajes ni cambiaron la cuenta vinculada. La entrega real se verifica después del despliegue; estas pruebas no acreditan paridad WHAPI ni aislamiento de infraestructura entre clientes aún no creados.

### Producción, 2026-10-02

EasyPanel completó correctamente el despliegue de `e959258` a las 13:47 UTC en el servicio existente. Chrome confirmó Mi espacio, navegación agrupada, diagnóstico colapsado e Integraciones. Se conservó la sesión del panel y WhatsApp volvió conectado con identidad verificada y un evento posterior al reinicio. Los contadores de contactos, conversaciones, mensajes y grupos coincidieron antes/después. No se enviaron mensajes, no se generó otro QR ni se duplicó el servicio. La configuración de recuperación aparece detectada; esta entrega no realizó un envío de correo ni cambió la contraseña real. Se cerró el servidor efímero de QA.
