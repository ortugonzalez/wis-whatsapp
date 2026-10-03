# Proyección conservadora de minutos — 2026-10-03 07:52 UTC

Frente 4, preparación local aislada. Chrome/EasyPanel conserva el último
despliegue del resumen de fotos, exitoso a las 06:54 UTC. El panel muestra lease
vigente y snapshot general 04:48 BA; el último entrante almacenado de origen live
sigue fechado 2/10 12:06 BA. No se infiere recepción reciente. Se verificaron cero
workers Node locales con comando local/worker.mjs; no se inició ninguno.

Se añadió business-hour-minutes.mjs, todavía sin conectar a API, inventario,
aliases o interfaz. Mantiene los atributos originales y proyecta únicamente
open_time/close_time numéricos enteros o texto decimal inequívoco. Conserva cero,
rechaza HH:mm, blancos, decimales y valores ambiguos. Apertura admite 0..1439;
cierre 0..1440. Estos límites son una política conservadora local, no límites
atribuidos al esquema oficial. La unidad fue verificada en la auditoría anterior.

La proyección mantiene alineación de filas, inspecciona como máximo 28 y señala
truncamiento. El agregado solo consulta el snapshot de negocio propio, conserva
la clasificación stale y exige evidencia de éxito previo para un snapshot no
disponible. Devuelve conteos, nunca valores de horarios ni identificadores.

Pruebas sintéticas aisladas 3/3 PASS. QA independiente aprobó la preparación y
recomendó exponer truncamiento también en el agregado: se incorporaron truncated,
row_limit y una prueba con datos válidos únicamente fuera del límite. No se
consultó WhatsApp, se modificó la sesión ni se desplegó este módulo.

## Próxima ruta

Integrar la proyección en la lectura de negocio propio y contextual_kinds con
fuente y truncamiento explícitos. Añadir pruebas de contrato que impidan contar
texto inválido, datos de contactos o filas fuera del límite como cobertura
numérica. Ajustar aliases sin reclamar equivalencia exacta y probar API/UI antes
de publicar junto con la corrección de alcance propia pendiente. Paridad WHAPI,
frescura de recepción y restauración productiva completa siguen sin verificar.
