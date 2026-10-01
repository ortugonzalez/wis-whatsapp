# Estado de entrega WIS WhatsApp

Actualizado: **2026-09-30 23:44 (Buenos Aires)**. Estado integral: **PARCIAL**. El panel está desplegado en EasyPanel y la sesión de WhatsApp figura conectada con identidad verificada. El sistema está operativo para consulta y administración; no se declara paridad completa con WHAPI.

### Fechas de escritura de snapshots en la auditoría WHAPI, 2026-10-01 02:44 UTC

EasyPanel implementó `feat: show snapshot dates in WHAPI evidence` (`b1ce229`) con build `Success`. La cobertura local ya incluye `snapshot_updated_at`; el panel lo conserva en las coincidencias exactas y semánticas, tanto en el explorador como en el detalle de variables. El texto ahora dice **“snapshot guardado”** y aclara que esa fecha no confirma cuándo se observó por última vez el campo. Si no existe una fecha, lo muestra explícitamente como no disponible.

Verificación pública después del despliegue: `GET /api/local-status` respondió HTTP 200, estado `connected` y `error: null`; el HTML y los 12 scripts públicos inspeccionados incluyen las etiquetas y la aclaración nuevas. Este endpoint confirma conexión básica, no identidad ni frescura del worker. No se inspeccionaron snapshots privados ni se tocó el QR. Suite local: 211/211; build estático y `git diff --check` aprobados; QA independiente PASS.

### Verificación posterior, 2026-10-01 01:32 UTC

EasyPanel confirmó el despliegue `fix: renew admin sessions from trusted activity` (`13fe484`). El JavaScript servido en producción coincide con el artefacto local del commit; `POST /api/session/refresh` respondió `authentication_required` sin cookie, como corresponde, y `GET /api/local-status` siguió en `connected` con `error: null`. Esto valida la versión servida y continuidad básica, no una renovación con sesión autenticada ni la frescura del worker. La política ahora conserva el acceso hasta 12 horas desde actividad confiable del usuario, con consultas limitadas a una cada 15 minutos y un tope absoluto de siete días. QA independiente: 18/18 pruebas; suite local: 199/199; build, API/n8n (5/5) y Python (12/12) aprobados.

La pestaña de Chrome muestra el ingreso administrativo y el estado neutral de WhatsApp conectado. No se introdujo una contraseña ni se solicitó otro enlace de recuperación. El QR no debe actualizarse mientras la sesión esté conectada. Para verificar snapshots, lease del worker y lecturas productivas hace falta volver a iniciar sesión en el panel; el acceso administrativo de esta pestaña no está activo.

### Claridad del acceso en Chrome, 2026-10-01 01:43 UTC

EasyPanel desplegó `fix: clarify dashboard login while WhatsApp is connected`. Tras recargar la pestaña existente de Chrome, el mensaje ahora indica que el login administrativo es independiente de la línea conectada y que no hace falta volver a escanear el QR. La respuesta pública continúa en `connected`, `error: null`. La pestaña queda lista en el login; los snapshots privados siguen pendientes de una sesión administrativa activa.

## Verificado en producción

- URL: `https://wis-whatsapp-wis.xbgh9n.easypanel.host/`.
- Verificación de continuidad, 2026-10-01 00:59 UTC (2026-09-30 21:59 Buenos Aires): `GET /api/local-status` respondió `connected` con `error: null`. La ruta pública confirma el estado básico de conexión, no identidad ni ingestión reciente. Chrome conserva el panel productivo, pero muestra el acceso de administrador; sin autenticación no se inspeccionaron métricas, lease del worker ni lecturas programadas en esta verificación.
- El panel reportó `Conectada · identidad verificada`; la identidad vinculada coincide con la esperada. El QR está deshabilitado mientras la sesión está conectada; no se solicitó otro enlace.
- El resumen de producción muestra 866 contactos, 567 conversaciones, 1.512 mensajes y 18 grupos. No se anotan nombres, números ni contenido de conversaciones. Estos conteos describen lo persistido localmente, no una exportación completa garantizada de WhatsApp.
- La última observación de producción consultada en Chrome fue el 30/9/2026 a las 11:02 (Buenos Aires): 931 eventos, 0 operaciones pendientes y 0 operaciones fallidas en el resumen; 378 campos en 27 tipos de datos. A las 11:06 la sesión seguía conectada e identidad verificada. La próxima lectura programada vence a las 11:12, por lo que el recolector estaba dentro del intervalo al verificarlo.
- A las 11:12 se verificó la ejecución programada `account_limits` con estado `done`; la siguiente lectura quedó programada como `account_username` para las 11:27. El panel mostró el último evento a las 11:12 y una actualización de snapshot a las 11:11. Esto confirma la ejecución del ciclo automático, no cobertura equivalente a WHAPI ni recepción reciente de mensajes.
- En la vista general, a las 11:13, el panel seguía mostrando la sesión conectada con identidad verificada, 932 eventos, 0 operaciones pendientes y 0 fallidas; el perfil se actualizó a las 11:12. La lectura siguiente figura como `account_username` a las 11:27.
- La matriz de producción calculada a las 11:17 mostró 154 rutas de respuesta con observación de 44.628 documentadas (14 exactas y 140 equivalencias revisadas). Solo 23 de 177 funciones con respuesta tienen alguna ruta observada; 4 aparecen completas. El explorador también lista las definiciones de parámetros y solicitudes. Los campos no observados permanecen como desconocidos, no como valores vacíos.
- Después del despliegue `fix: recognize observed business hours fields`, la página volvió a responder y conservó la sesión vinculada e identidad verificada. A las 11:37 el auditor mostró 155/44.628 rutas de respuesta observadas (14 exactas y 141 equivalencias revisadas); `Get business profile` pasó a 8/12. La vista general mostró 868 contactos, 567 conversaciones, 1.512 mensajes, 18 grupos y 938 eventos, con cero operaciones pendientes o fallidas. No se usó el último evento como prueba de recepción de mensajes entrantes recientes.
- La actualización manual de lecturas de solo lectura completó 5 de 6 pasos: cuenta/grupos, lista de bloqueos, comunidades, colecciones y canales respondieron; la consulta del catálogo devolvió `read_timeout`. El total subió a 31 lecturas fallidas históricas. No se repitió la consulta fallida. La respuesta vacía de comunidades solo describe lo devuelto a esa sesión en ese momento.
- La actualización de grupos aparece aplicada a las 10:51 y conserva 18 grupos observados. No se reportan aquí nombres, participantes ni identificadores.
- La lectura manual más reciente del catálogo, a las 11:02, terminó con `read_timeout`. La pantalla de productos muestra alcance, origen y resultado del último intento. El timeout de la alternativa Baileys no demuestra que el catálogo privado esté vacío; no se insistió con otra consulta.
- El panel registró un cierre anterior con `restart_required (515)` a las 09:55; después volvió a mostrar la sesión conectada e identidad verificada. Aun así, no hay una recepción entrante en vivo posterior al 28/9 a las 16:32. La reconexión está confirmada; la recepción en vivo posterior a ella no.
- La lectura productiva de metadatos de canales terminó el 30/9/2026 a las 10:45 (Buenos Aires) con una respuesta vacía para los canales conocidos por la sesión. El panel la identifica como observación parcial y aclara que no representa el directorio completo; no se interpreta como que la cuenta no tenga canales.
- La recepción entrante más reciente que muestra el panel es del 28/9/2026 a las 16:32. No se usa ese evento anterior para afirmar que hubo un mensaje después de la reconexión del 30/9.
- El historial completo anterior a la vinculación no está garantizado. El panel distingue hora de escritura de snapshot de hora de observación de cada campo.
- Envíos salientes y dispatcher de webhooks siguen desactivados en la imagen Docker. La vinculación y las lecturas no envían mensajes.
- Pruebas: `npm test`, compilación/verificación estática de JavaScript y `git diff --check` pasaron en esta revisión.

## Brechas abiertas

- El inventario público de WHAPI contiene 182 métodos. La matriz WIS registra 61 parciales, 120 pendientes y 1 no soportado; ninguno está certificado como equivalente completo. Esto es una brecha funcional explícita, no una métrica de disponibilidad de la cuenta.
- No hay evidencia suficiente para prometer cobertura de llamadas, recuperación total de historial, estados históricos, administración de catálogo, todas las funciones Business, ni contrato intercambiable con WHAPI.
- El estado conectado solo confirma sesión e identidad. La ausencia de un mensaje posterior a la reconexión no se toma como prueba de recepción en vivo; queda pendiente verificarla cuando llegue actividad normal.
- La lectura privada del catálogo sigue sin respuesta verificable por timeout; no se infiere que falten productos ni que no exista un catálogo Business.
- La prueba productiva de recepción requiere que llegue un mensaje legítimo a la línea; los envíos continúan pausados. No se enviaron mensajes de prueba.
- Python y n8n tienen contratos HTTP documentados, pero aún necesitan integración y aceptación en las instancias reales del usuario. Sus workflows de ejemplo no están activados.

## Próximos pasos

1. Mantener el servicio actual y verificar recepción cuando llegue actividad normal, sin enviar mensajes de prueba.
2. Continuar la auditoría de lecturas con respuestas correlacionadas. Las lecturas recientes de comunidades y canales conocidos devolvieron respuestas vacías; esto no acredita que la cuenta carezca de esos recursos ni permite inventar identificadores para consultar.
3. Cerrar primero lectura de capacidades para administración y APIs. Mantener bloqueadas las funciones de escritura hasta revisión y aprobación específica.
4. Revisar y corregir cualquier error de lectura persistente en el panel antes de habilitar nuevas consultas de cuenta.
5. Validar los ejemplos de Python y n8n en entornos de prueba y documentar credenciales y permisos sin almacenarlos en Git.

Referencias: [matriz de campos WHAPI](whapi-reference-fields.md), [cobertura de datos](data-coverage.md), [manual de SQLite](sqlite-local.md), [despliegue EasyPanel](easypanel.md).
