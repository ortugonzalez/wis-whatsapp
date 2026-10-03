# Evidencia revisada en producción — 2026-10-03

## Resultado

Se desplegó `b7dcd4a` en el servicio existente. EasyPanel confirmó Success a las 10:23:05 UTC. Antes del despliegue, la cola mostró cero operaciones pendientes y cero enviándose. No se encolaron lecturas ni envíos manuales, ni se modificaron credenciales o vinculación.

El comparador ahora respeta las equivalencias revisadas: un campo crudo homónimo no sustituye una evidencia semántica ausente, vacía o antigua. API y tabla aplican la misma prioridad. El caso de regresión corresponde al objeto local de estado frente al texto de estado requerido por WHAPI.

Validación previa: suite completa 322/322; pruebas focales 15/15; revisión independiente sin hallazgos bloqueantes. Los casos vacíos y obsoletos se verificaron con datos sintéticos, no se provocaron en producción.

## Verificación productiva en Chrome

- Get contact: 5/10 campos observados, cinco sin marca obsoleta, cero solo obsoletos y cinco sin observar. No aumentó la cobertura.
- Estado de contacto: evidencia anidada presente en 71/981 registros; texto no vacío en 38/71. La tabla conserva la equivalencia revisada y la fecha del snapshot.
- Tras el despliegue: conectado con identidad verificada y lease vigente. Último cierre observado: 07:00 Buenos Aires, código 428.
- Última escritura de snapshot: 07:23 Buenos Aires; 29 tipos y 443 campos listados.
- Entrantes almacenados de origen live: 14; fecha del último mensaje: 2026-10-02 12:06 Buenos Aires. No hay evidencia nueva de recepción reciente.
- Fallos de lectura acumulados: 83. Último comando programado de solicitudes de grupos finalizado; próxima ruta indicada: fotos de perfil a las 07:29 Buenos Aires.
- Consulta de procesos locales: cero procesos Node cuya línea de comando coincidiera con local/worker.mjs. Esto no constituye un censo de procesos productivos.

Captura local revisada, sin valores personales: `.local/reviewed-evidence-production.png` (excluida de Git). Panel productivo abierto en Chrome.

## Próxima ruta

Auditar otra familia del catálogo (grupos o metadatos de mensajes) contra snapshots ya disponibles y documentar equivalencias y brechas. Evitar repetir lecturas agotadas o volver a auditar los mismos cinco faltantes de contacto sin evidencia nueva. Sigue pendiente demostrar recepción reciente y cerrar cobertura WHAPI; conexión y comandos finalizados no prueban ninguna de ambas cosas.
