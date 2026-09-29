# Recuperación de acceso del administrador

El formulario **Olvidé mi contraseña** entrega enlaces de recuperación por correo. El propietario abre el enlace y define la nueva contraseña en la pantalla de WIS; el servicio no crea ni envía contraseñas temporales.

## Easypanel y Gmail

Configura estas variables en `wis / whatsapp-wis / Entorno`:

- `WIS_ADMIN_RECOVERY_EMAIL`: dirección que recibirá los enlaces. La dirección configurada para esta instalación es `ortugonzalezz@gmail.com`.
- `WIS_SMTP_PASS`: contraseña de aplicación de Google. Se guarda como variable secreta de Easypanel; no la escribas en Git, logs, correo ni chat.

Con una dirección `@gmail.com`, el panel usa Gmail SMTP seguro por el puerto 465 y la misma dirección como usuario y remitente. Una contraseña normal de Google no funciona en SMTP; requiere una contraseña de aplicación habilitada en la cuenta. Para otros proveedores, configura además `WIS_SMTP_HOST`, `WIS_SMTP_PORT` (465 o 587), `WIS_SMTP_USER` y `WIS_SMTP_FROM`.

Luego guarda el entorno y despliega. En la pantalla de acceso, pulsa **Olvidé mi contraseña**; el enlace vence en 30 minutos y solo puede usarse una vez. Al cambiar la clave, se invalidan todas las sesiones web existentes. Se limitan las solicitudes de recuperación a tres por dirección de red cada 15 minutos. El token se guarda como hash y nunca aparece en logs ni en la respuesta de solicitud.

Hasta que exista SMTP válido, `password_recovery_available` queda en `false` y el formulario muestra que el correo no está configurado. Un fallo de entrega elimina el token pendiente y no informa secretos del proveedor.
