# Ensayo aislado de consulta después de restaurar SQLite

2026-10-03, ejecución 01:22 UTC. Worktree limpio al iniciar. Ruta 5 continuación de verificación de respaldo, sin bloqueo de la ruta anterior.

Se incorporó una prueba que cruza verificación de respaldo, copia SQLite, apertura de esquema y API HTTP autenticada. Utiliza datos ficticios, directorio temporal exclusivo y puerto efímero loopback. Confirma 401 sin token, consultas correctas de tres estados, envíos desactivados en overview, lease ausente, ausencia de comandos de lectura, cola intacta y bytes de origen intactos. No invoca supervisor ni Baileys. La prueba cierra el servidor y elimina solo su directorio temporal.

Primer intento: token del fixture no tenía prefijo requerido; la API rechazó correctamente con 401. Se corrigió el fixture, sin modificar autenticación. Resultado focal: 1/1 PASS. No se repitió la suite global porque solo se agregó prueba y documentación; la suite del cambio de contrato anterior ya pasó 296/296.

Chrome confirma como última publicación el ajuste de fechas de mensajes de 00:39:51 UTC. No se despliega el ensayo ni se modifica la instancia activa. La evidencia productiva no se sustituye por los resultados de este fixture.

Manual ampliado con conciliación por estado, límites de los conteos y revisión separada de webhooks, campañas y lecturas. La recuperación integral y copia externa de producción siguen pendientes; no se declara restauración de credenciales o archivos verificada.

Próxima ruta: volver al inventario de lecturas Baileys y escoger una brecha funcional verificable, sin recopilar datos adicionales durante este ensayo ni activar componentes productivos.

QA independiente: PASS, ejecución focal 1/1; confirmó aislamiento y alcance limitado a consulta API de la copia. Endpoint productivo observado al cerrar: connected, sin error actual. Esto no demuestra recepción reciente.
