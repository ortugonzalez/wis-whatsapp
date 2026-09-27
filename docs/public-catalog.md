# Lectura pública de catálogo y colecciones

## Investigación y evidencia · 27/09/2026

La consulta IQ `w:biz:catalog` de Baileys 7.0.0-rc14 no obtuvo una respuesta válida en esta instalación. El [reporte técnico del proyecto Baileys](https://github.com/WhiskeySockets/Baileys/issues/2717) describe el mismo problema. Se contrastó la alternativa con módulos JavaScript públicos de [WhatsApp Web](https://web.whatsapp.com/), sin acceder a cookies del navegador ni ejecutar el código descargado.

Los módulos `WAWebQueryCatalog`, `WAWebQueryProductCollections`, sus operaciones GraphQL y `WAWebGraphQLConstants` identifican una API pública de lectura bajo `https://graph.whatsapp.com/graphql/catalog`. El adaptador descubre la configuración pública desde recursos HTTPS de `static.whatsapp.net`, resuelve únicamente el valor exportado para catálogo y lo conserva en memoria. No utiliza la sesión privada de Chrome ni credenciales de administración del catálogo. No guarda ni imprime el token público.

La consulta real usó exclusivamente la identidad completa de la cuenta vinculada y cotejada localmente:

- **Colecciones públicas:** respuesta estructural válida, cero elementos, sin cursor siguiente.
- **Catálogo público:** respuesta GraphQL con código numérico `2498052`; no se interpreta como catálogo vacío. El código público de WhatsApp trata esa condición como error. Su significado más específico para la cuenta no está confirmado.

La prueba inicial solo inspeccionó conteos y códigos de error saneados, sin publicar identificadores de la cuenta, contenido de productos ni configuración de acceso.

## Alcance y garantías

Esta ruta describe el catálogo **público visible**. No permite afirmar cobertura de productos ocultos, borradores, pedidos o administración comercial. Una respuesta válida permanece parcial respecto del catálogo privado del propietario.

El adaptador fija la cuenta al crearse; no recibe destinos arbitrarios por petición. Las consultas son de lectura, con límites de tiempo y bytes, sin redirecciones, cookies ni reintentos automáticos. Una denegación no activa otra ruta para eludirla. Las respuestas deben incluir el contenedor esperado, listas reales y registros con identificador válido; `null`, campos ausentes y errores no se convierten en listas vacías.

Las operaciones persistidas y los módulos públicos pueden cambiar. La detección de cambios falla de forma explícita; no ejecuta JavaScript remoto. Las pruebas usan respuestas simuladas y credenciales ficticias. La revisión independiente está registrada en `ops/reports/qa/wis-sqlite-review.md`.
