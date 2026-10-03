# Persistencia del diagnóstico de recepción — 2026-10-03 09:37 UTC

Frente 5, alternativa sin mensajes de prueba ni lecturas WhatsApp. Worktree limpio
al inicio. Chrome confirma último despliegue 09:26 UTC, conectado, identidad
verificada y lease vigente. Snapshot general 06:36 BA; última lectura programada
account_limits, comando finalizado, encolada 06:29 BA. Cero workers locales detectados.

Diagnóstico productivo: último lote socket sin observación; notificación entrante
y lote entrante añadido sin fecha. Último entrante almacenado 2/10 12:06 BA, último
evento 3/10 06:29 BA. Estos datos no demuestran recepción reciente, pérdida de
mensajes ni borrado de evidencia durante un despliegue.

Se añadió una prueba aislada con SQLite en disco temporal y reapertura. Usa el
observador pasivo real con EventEmitter sintético: history no crea observación,
sobres duplicados se cuentan sin reclamar unicidad, un eco append no crea entrada
ni borra la fecha notify previa, pérdida simulada de propiedad evita escrituras.
Al reabrir sobreviven el último agregado y la evidencia inbound anterior; no se
persisten identificadores ni contenido de los sobres. Cleanup acotado por ruta
absoluta padre y prefijo temporal verificados antes de eliminar.

Autor: 4/4 pruebas focales, luego 1/1 tras reforzar cleanup. QA independiente: 1/1
PASS. Solo test y documentación nuevos; no se repitió la suite completa ni hubo
despliegue. Limitación explícita: guard y callback de persistencia son fixtures;
no se prueba el lease real ni el worker productivo, sesión o entrega WhatsApp.

Próxima ruta: comprobar el cableado observador/guard/snapshot del worker con un
ensayo de integración aislado que reutilice sus fixtures, sin abrir otra sesión.
Así se distingue persistencia del helper de integración efectiva sin repetir
consultas agotadas. La recepción productiva y paridad WHAPI siguen pendientes.
