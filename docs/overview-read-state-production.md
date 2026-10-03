# Resumen de lecturas — 2026-10-03 09:22 UTC

Frente 4. Worktree inicialmente limpio. Chrome mostraba sesión conectada, lease
vigente y snapshot 06:15 BA, con 83 fallos históricos. Se reutiliza scheduled_reads
ya consultado por el resumen: no se añade ninguna petición ni lectura WhatsApp.

La tarjeta ahora dice Fallos de lectura acumulados y muestra la última lectura
programada con estado y fecha explícita de encolado. Un texto separa comando
finalizado de datos completos y recepción. Rutas/estados se proyectan mediante
allowlist; fechas inválidas y nombres desconocidos no se reproducen. Sin cambios
en programación, worker, permisos o contrato backend.

Autor y QA independiente: 11/11 pruebas de observabilidad PASS cada uno. Verificación
visual local del JS y CSS reales con datos sintéticos: texto legible y sin solapar.
Servidor de fixture y pestaña cerrados. No se repitió la suite completa porque el
cambio es exclusivamente de presentación y se verificó el render afectado.

Cola productiva verificada con cero pending y sending. Push únicamente a production.
Un despliegue EasyPanel, Success 09:26:22 UTC. DOM productivo confirma la nueva
etiqueta y Canales (newsletters), Comando finalizado, encolada 06:14 BA. Conectado,
identidad verificada, lease vigente; snapshot06:26 BA y último entrante almacenado
sin cambio (2/10 12:06 BA). No se infiere recepción reciente.

La captura productiva del detalle fuera del viewport agotó tiempo y los controles
de desplazamiento no respondieron; no se insistió sobre la misma captura. Se guardó
una captura acotada del resumen visible sin identificadores en
.local/read-summary-overview.png. Verificación del detalle productivo por DOM;
verificación visual del detalle solo en fixture. Panel permanece abierto.

Próxima ruta: mejorar visibilidad del diagnóstico de recepción usando datos de
overview ya guardados, o auditar otra familia WHAPI con evidencia disponible.
No repetir consultas agotadas. Paridad y preparación SaaS siguen incompletas.
