# Auditoría de frescura productiva

Ejecución del 2026-10-03 00:06 UTC. Ruta 2 tras la ampliación de pruebas de la ejecución anterior. Worktree limpio al iniciar; lectura en Chrome del dashboard productivo y del registro EasyPanel. No se usó SQLite local como evidencia productiva.

- Último despliegue visible: Success, 2026-10-02 23:44:20 UTC.
- Endpoint productivo: connected, error actual nulo. La desconexión histórica expuesta sigue fechada a las 18:48:41 UTC del 2 de octubre; no se la considera un fallo actual.
- Almacenados: 967 contactos, 568 conversaciones, 1539 mensajes, 18 grupos. Sin variación frente a la última evidencia agregada posterior a la auditoría inicial.
- Última notificación entrante y último lote entrante añadido: sin observación registrada. Esto no demuestra una falla de recepción ni ausencia de tráfico; no se hizo envío de prueba.
- Último mensaje entrante almacenado: 2 de octubre 12:06, hora mostrada en Chrome (Argentina). Último evento: 20:56; perfil: 20:44. Eventos y perfil no son evidencia de recepción de mensajes.
- 1000 eventos retenidos, cero operaciones pendientes y cero fallidas.
- Matriz calculada a las 21:07 del 2 de octubre, hora de Chrome: 182 funciones/esquemas, 177 funciones con respuesta, 44628 rutas de respuesta; 188 observadas (14 exactas, 174 equivalencias), 44440 sin observar. 188 sin marca obsoleta, cero solo obsoletas. 23 funciones con alguna ruta observada y 4 con todas las rutas documentadas observadas. No cambió la cobertura; la fecha del cálculo no renueva las observaciones.

Brecha seleccionada para la siguiente ruta: `checkhealth` conserva 0/22 rutas observadas pese al estado conectado local. El código limita esta comparación a snapshots de tipo `connection` (`local/public/whapi-field-aliases.js`). Revisar qué propiedades son semánticamente equivalentes y qué propiedades son exclusivas de WHAPI antes de añadir correspondencias. No mapear códigos de estado por similitud ni etiquetar como oficial una sesión Baileys. Empezar por fixtures de contrato y evidencia de tipos; no ejecutar la operación WHAPI que también puede iniciar un canal.

No hubo envíos, lecturas nuevas a WhatsApp, reinicios, cambios de permisos, despliegues ni capturas repetidas. Continúan pendientes recepción pasiva verificable, brechas funcionales y paridad completa. Esta auditoría no exige acción del usuario.

QA independiente: PASS de consistencia, aritmética, privacidad y alcance de la siguiente ruta. Revisó el código y la evidencia agregada del owner; no repitió consultas productivas ni certificó recepción nueva.
