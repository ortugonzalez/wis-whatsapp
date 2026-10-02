# Visibilidad de observaciones pasivas

2026-10-02, seguimiento iniciado a las 22:36 UTC. Ruta 2/4, auditoría de datos ya persistidos. Worktree limpio al inicio.

Chrome recargado en producción: 966 contactos, 568 conversaciones, 1539 mensajes, 18 grupos. Son tres contactos más que los 963 de la auditoría de las 21:37 UTC; este aumento no identifica su origen ni demuestra mensajes entrantes nuevos. No se copiaron registros personales, identificadores o contenidos.

La revisión de implementación descartó duplicar vistas ya existentes:

- Presencia: el detalle de conversación ya incluye el snapshot correspondiente. El worker conserva observaciones por participante, con fecha propia y secuencia, hasta 512 entradas; no reemplaza toda la lista al recibir un cambio individual. Las pruebas existentes cubren mezcla y límite.
- Etiquetas de miembros: el detalle de grupo ya recibe `observed_member_tags`, con un máximo de 500, truncamiento y alcance de eventos recibidos; no equivale a permisos actuales.
- Solicitudes de ingreso: la tarjeta de grupo ya muestra eventos observados además de la respuesta de lectura. No corresponde añadir otra consulta remota para hacerlos visibles.

Se revisó el esquema capturado `getpresence`: tres rutas de respuesta, `contact_id`, `last_seen` y `status`; sus estados son online/offline/typing/recording/pending. El snapshot local usa identificadores dinámicos y lastKnownPresence/lastSeen. No se añadieron aliases: antes de acreditar equivalencia hacen falta reglas explícitas para identidad, enum, ausencia y antigüedad por participante. Una ruta parecida o una fecha de guardado reciente no demuestra presencia actual.

El parser instalado `node_modules/baileys/lib/Socket/chats.js` transforma `paused` en `available` antes de emitir el evento, y `media=audio` en `recording`. Por ello no es válido inventar `pending` desde una pausa ya normalizada. `lastSeen` se convierte numéricamente desde el atributo `last`, omitiendo `deny`; este código por sí solo no documenta la unidad del contrato WHAPI.

No hubo lecturas al proveedor, cambios de cuenta, envío, reinicio ni despliegue. Próxima ruta: normalización contextual de presencia para API/dashboard con estados históricos claramente fechados; contrastar cada enum y unidad antes de aumentar cobertura WHAPI. Mantener como desconocida la presencia actual sin una observación vigente verificable.
