# Revalidación de cobertura WHAPI — 2026-10-01

Se ejecutó `npm run audit:whapi-fields -- --summary` después del despliegue. El cálculo devolvió 182 métodos, 177 con campos de respuesta, 14 rutas exactas y 127 equivalencias semánticas revisadas, de un total de 44.628 rutas de respuesta documentadas. Hay 23 métodos con alguna observación, 4 con todas sus rutas observadas y 154 sin ninguna.

**Alcance de la evidencia:** el comando leyó `.local/wis.sqlite` de este checkout y el catálogo WHAPI versionado. No consultó la base de EasyPanel ni prueba disponibilidad actual de datos del número. Estos totales describen la copia local; no son cobertura productiva y no demuestran paridad.

**Próxima ruta:** con una sesión administrativa activa en Chrome, obtener el resumen agregado autenticado de producción y comparar únicamente `observed_at`, cantidad de rutas y estados de lectura. Después, seleccionar la brecha Get menos cubierta con un getter público verificable. No leer ni copiar contenido personal.
