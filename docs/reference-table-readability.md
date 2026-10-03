# Explorador WHAPI: legibilidad — 2026-10-03 05:37 UTC

Frente 4: presentación del catálogo. Producción responde HTTP 200, estado
`connected`, sin error declarado. Esto no acredita recepción reciente. EasyPanel
mantiene como último despliegue la corrección de cobertura de identidades.
No se reinició ni creó un worker; inspección local encontró cero procesos Node
con `local/worker.mjs` en su comando (no describe procesos del servidor remoto).

## Evidencia y cambio local

En Chrome, el catálogo productivo distribuye once columnas en 1037 px;
la columna Tipo mide 68 px y evidencia 183 px. El texto se fragmenta.
Se añadió una región desplazable con foco y nombre accesibles, indicación de
teclado, encabezado fijo y ancho mínimo de columnas. Conserva las once columnas,
escapes, filtros, paginación y contenido completo de la evidencia.

Una vista sintética aislada, sin API, base ni WhatsApp, cargó los estilos reales.
Chrome midió tabla de 1875 px en contenedores útiles de 1014 y 297 px, con
columna Tipo de 100 px y evidencia de 440 px. Foco por teclado y ArrowRight
funcionaron: scrollLeft pasó a un valor positivo y el foco permaneció en región.
`node --check local/public/capability-audit.js` pasó; qa_ops dio PASS a revisión
estática independiente, sin modificar código.

## Pendiente y próxima ruta

No desplegado. Captura de viewport agotó 5 s; alternativa de recorte acotado
también agotó 5 s. Las medidas DOM no sustituyen revisión visual de encabezados,
scroll y lectura completa. No repetir la captura sin una ruta distinta o señal
de recuperación. Próximo turno: comprobar visualmente mediante otro navegador
disponible para la fixture local, cerrar QA y recién entonces desplegar. Si sigue
bloqueado, pasar al inventario de campos pendientes (frente 2), sin tocar sesión.
La paridad WHAPI y la recepción reciente continúan sin demostrarse.

## Cierre visual — 2026-10-03 05:52 UTC

Ruta alternativa efectiva: fixture en navegador integrado, manteniendo Chrome
para producción. Capturas visuales confirmaron texto sin fragmentación, barra
horizontal accesible y encabezados fijos al desplazar verticalmente; evidencia
completa visible al extremo derecho. La fixture contiene solo texto sintético.
Captura local ignorada: `.local/reference-table-visual-qa.png`.
La revisión estática independiente PASS y la comprobación DOM/teclado del turno
previo se complementan con esta inspección visual. `git diff --check` sin errores.
Antes de publicar, Chrome mostró cero operaciones `sending` y cero `pending`.

## Producción

Commit `4b5ffae`, un único despliegue, EasyPanel Success a las 05:54:28 UTC.
Chrome, tras recargar, mostró región enfocada con once encabezados, ancho de
1875 px dentro de 1022 px, y scrollLeft 40 al usar flecha derecha. El filtro
getcontact devolvió 11 definiciones; evidencia contact.name sigue 32/979,
texto 32/32. Captura productiva ahora funcionó: encabezados fijos y evidencia
completa legibles. Archivo ignorado `.local/reference-table-production.png`.
El servidor de fixture quedó detenido y su pestaña cerrada; no se creó worker.

Próxima ruta: inventario de campos sin observación (frente 2), priorizando
equivalencias verificables con datos ya disponibles y sin solicitudes duplicadas.
Esta mejora visual no agrega cobertura ni demuestra actividad entrante reciente.
