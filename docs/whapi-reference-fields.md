# Referencia de variables WHAPI

`public/whapi-fields.json` contiene un inventario estructural fechado de los 182 métodos públicos encontrados en el índice oficial de WHAPI. Se extraen nombres de parámetros, rutas de campos, tipos, obligatoriedad y enumeraciones de sus definiciones OpenAPI. Se omiten ejemplos, credenciales y descripciones comerciales.

Regenerar desde la raíz: `rtk proxy node scripts/whapi-fields.mjs`.

La extracción sigue referencias locales de esquema, arrays y alternativas `oneOf`, `allOf` y `anyOf`, con límite de profundidad para evitar ciclos. Las variantes pueden producir rutas repetidas. No es una prueba de que Baileys exponga esos campos, ni un contrato compatible con WHAPI. Los esquemas oficiales completos permanecen enlazados por método.

La API WIS ofrece `/api/v1/reference-fields` como índice compacto y `?id=getuserprofile` para consultar una definición concreta. Requiere autenticación. Los valores reales de la cuenta se consultan en los recursos propios de WIS; jamás se rellenan campos desconocidos con datos inventados.

El catálogo de capacidades registra por separado implementación, prueba y brecha. Las operaciones que modifican WhatsApp requieren implementar sus controles y aprobar pruebas concretas antes de habilitarlas.
