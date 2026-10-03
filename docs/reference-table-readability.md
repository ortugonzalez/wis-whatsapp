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
