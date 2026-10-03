# Auditoría de actualización y arranque

Ejecución 00:51 UTC del 2026-10-03. Ruta 1: auditar el Not Found transitorio del despliegue anterior sin reiniciar ni cambiar la sesión.

Worktree limpio al iniciar. Chrome/EasyPanel confirmó Success del 00:39:51 UTC y permitió leer los controles avanzados: una réplica, cero downtime desactivado, Tini desactivado. No se guardaron cambios. Endpoint productivo devuelve connected, error actual nulo; no implica recepción reciente.

Código revisado: Dockerfile healthcheck (20 segundos de arranque, intervalo 30, timeout 5, tres reintentos); start.mjs crea supervisor/API/worker; supervisor.mjs permite recarga exclusiva de API por IPC y detiene ambos hijos en una actualización completa. El bloqueo de supervisor compara PID y /proc, no identidad global entre contenedores. No recomendar solapamiento de contenedores para ocultar la ventana del proxy.

Resultado concreto: manual EasyPanel ampliado con diagnóstico acotado y separación entre construcción, HTTP, sesión y recepción; explica por qué no duplicar workers ni reutilizar las variables iniciales sobre producción vinculada. No hay evidencia suficiente para atribuir la respuesta transitoria a un fallo específico de Traefik ni para prometer cero downtime.

Próxima ruta: revisar brechas funcionales de lectura y entrega SaaS, manteniendo estrategia de réplica única; cualquier propuesta de separar API/worker debe validarse aislada antes de afectar volúmenes o producción. No se hizo despliegue ni se activaron banderas, cuentas o envíos.

QA independiente: PASS de exactitud contra código y alcance operativo; observaciones productivas contrastadas con evidencia del owner, sin nuevas consultas. Solo documentación: no se repitió la suite de aplicación ya aprobada, y git diff --check pasó.
