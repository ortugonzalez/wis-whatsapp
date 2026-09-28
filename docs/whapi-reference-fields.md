# Referencia de variables WHAPI

`public/whapi-fields.json` contiene un inventario estructural fechado de los 182 métodos públicos encontrados en el índice oficial de WHAPI. Se extraen nombres de parámetros, rutas de campos, tipos, obligatoriedad y enumeraciones de sus definiciones OpenAPI. Se omiten ejemplos, credenciales y descripciones comerciales.

Última extracción 2026-09-28 02:23 UTC: 182 métodos, 181 operaciones HTTP, 59.813 apariciones de campos y 5.389 rutas distintas entre request y response; se volvieron a consultar las 182 definiciones oficiales y no falló ninguna. Las apariciones se repiten entre métodos, respuestas y variantes de esquema, así que estos totales describen el inventario documental, no 59.813 valores disponibles en la cuenta vinculada.

Regenerar desde la raíz: `rtk proxy node scripts/whapi-fields.mjs`.

La extracción sigue referencias locales de esquema, arrays y alternativas `oneOf`, `allOf` y `anyOf`, con límite de profundidad para evitar ciclos. Las variantes pueden producir rutas repetidas. No es una prueba de que Baileys exponga esos campos, ni un contrato compatible con WHAPI. Los esquemas oficiales completos permanecen enlazados por método.

La API WIS ofrece `/api/v1/reference-fields` como índice compacto y `?id=getuserprofile` para consultar una definición concreta. Requiere autenticación. Los valores reales de la cuenta se consultan en los recursos propios de WIS; jamás se rellenan campos desconocidos con datos inventados.

El catálogo de capacidades registra por separado implementación, prueba y brecha. Las operaciones que modifican WhatsApp requieren implementar sus controles y aprobar pruebas concretas antes de habilitarlas.
