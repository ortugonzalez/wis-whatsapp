# Roles de participantes — 2026-10-03 10:52 UTC

## Hallazgo y corrección

El parser instalado de Baileys (`lib/Socket/groups.js`, extractGroupMetadata) produce `admin: attrs.type || null`. El contrato de tipos admite admin, superadmin o null. WIS convertía cualquier otro valor, incluso un dato ausente, en member en su consulta administrativa por código de invitación. Esa inferencia podía presentar como válido un rol desconocido.

La proyección acepta solo admin→admin, superadmin→creator y null explícito→member. Conserva el ID válido de un participante con rol desconocido pero omite rank. Informa cantidades de filas rechazadas y roles desconocidos, además de un indicador de completitud de la proyección del fragmento recibido. Ese indicador no certifica membresía completa ni paridad WHAPI; el catálogo exige rank, por lo que una fila sin él sigue siendo una brecha. El límite sigue siendo 4096 elementos y los snapshots originales no se modifican.

El panel describe la respuesta como recibida, advierte datos incompletos y aclara que no garantiza la lista completa del grupo. No se realizó ninguna consulta productiva por código, no se usaron invitaciones ni se encolaron lecturas.

Validación owner: 10/10 pruebas focales, incluyendo roles ausentes/desconocidos, valores explícitos, filas inválidas, ausencia de lista y truncamiento. QA independiente: 4/4 PASS sin hallazgos. La comprobación usa datos sintéticos y el parser instalado, no participantes privados.

## Producción observada antes del cambio

Despliegue b7dcd4a, sesión conectada e identidad verificada, lease vigente. Snapshot más reciente a las 07:44 Buenos Aires. El comando automático de bots falló y los errores acumulados pasaron de 83 a 84; la próxima ruta indicada es temporizador de mensajes. No se reintentó el fallo. Entrantes live: 14, último mensaje 2026-10-02 12:06 Buenos Aires; no se verificó nueva recepción.

## Siguiente ruta

Verificar la publicación conjunta con la corrección de alcance de getgroup.id. Después, revisar frescura y respuesta agregada del ciclo de lecturas; un comando finalizado no prueba nuevos mensajes ni cobertura de todos los campos. Mantener la consulta por código exclusivamente a petición, sin usarla como prueba automática productiva.

## Publicación y verificación

Suite completa: 324/324 PASS. Publicado 2bf6740 junto con 9c93f43; EasyPanel confirmó Success el 2026-10-03 a las 10:56:28 UTC. Antes de publicar, filtros de operaciones pendientes y procesando mostraron cero filas.

Chrome ya muestra getgroup.id respaldado exclusivamente por group.id, 18/18 snapshots, sin los 568 chats y conversaciones genéricos. Get group conserva 29/759 rutas observadas: se corrigió procedencia, no se agregaron campos. Captura local revisada sin valores privados: `.local/group-scope-production.png`, excluida de Git.

Después del despliegue: conectado con identidad verificada, lease vigente, snapshot más reciente 07:56 Buenos Aires. Se mantienen 84 errores acumulados y los mismos 14 entrantes live; no hay nueva evidencia de recepción. No se ejercitó la consulta por invitación en producción: sus casos de rol desconocido quedan verificados por fixtures y QA, no por una consulta remota. Próxima ruta: analizar el fallo de bots ya registrado mediante evidencia existente, sin repetir la lectura agotada ni alterar el calendario.
