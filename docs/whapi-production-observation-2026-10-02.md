# Evidencia productiva y próxima brecha WHAPI — 2026-10-02

## Cobertura autenticada

Con la sesión administrativa existente en Chrome, el endpoint autenticado de cobertura de campos respondió HTTP 200 a las 13:12 UTC. Producción informa 182 métodos (177 con esquema de respuesta), 23 con alguna coincidencia y 4 con todas las rutas observadas. Sobre 44.628 rutas de respuesta documentadas, 14 coincidieron por nombre exacto y 174 mediante equivalencias semánticas revisadas; 188 están respaldadas por snapshots no marcados como obsoletos y 44.440 siguen sin observación. Esto es cobertura de campos, no paridad de endpoints.

La pantalla de variables mostró 418/418 rutas locales de snapshots. Ese inventario no es comparable uno a uno con las 44.628 rutas WHAPI: incluye campos propios de WIS y agregados, mientras el auditor WHAPI cuenta rutas de respuesta con mapeo literal o semántico. El resumen local del checkout da 14 exactas y 125 semánticas, pero su snapshot más reciente es del 28 de septiembre; no representa la copia de EasyPanel. Mantener separados los conteos local y productivo.

## Estado operativo observado

El dashboard productivo mostró la línea `connected`, identidad verificada, Baileys y sesión persistente. Los envíos permanecen pausados; operaciones pendientes: 0; fallidas: 0. La última actividad entrante en vivo que muestra el panel es del 28 de septiembre. La conexión actual, por sí sola, no prueba recepción reciente.

El catálogo acumula 28 lecturas fallidas: 25 `read_timeout`, 2 `public_catalog_unavailable` y 1 `read_unavailable_or_disconnected`; el último fallo fue el 2 de octubre a las 09:23 hora local. No se inició otro intento.

## Brecha de etiquetas y alcance Baileys

La referencia pública de WHAPI documenta `GET /labels` para recuperar etiquetas registradas y `GET /labels/{LabelID}` para consultar objetos asociados. La versión de Baileys instalada no ofrece un getter público exhaustivo de etiquetas: el código expone eventos `labels.edit` y `labels.association`, además de métodos de escritura. WIS ya persiste esos eventos cuando llegan; eso no reconstruye etiquetas ni asociaciones previas que no hayan sido sincronizadas.

Fuentes: [WHAPI Get labels](https://whapi.readme.io/reference/getlabels) y [WHAPI Get objects associated with label](https://whapi.readme.io/reference/getlabelassociations).

No cubrir esa brecha con mutaciones ni asumir que los eventos equivalen a una lectura completa.

## Operaciones GET priorizadas por brecha

La respuesta agregada productiva del mismo endpoint marca, entre las operaciones de lectura revisadas: `getcommunity` 0/759 rutas observadas; `getcommunitysubgroups` 0/12; `getlabels` 0/4; `getlabelassociations` 0/1.429; `getusername` 0/3; `getcontactprofile` 3/6; `getcontactabout` 1/1; `getnewchatlimit` 7/11; y `getreachouttimelock` 3/3. Cero observaciones significa que el informe no encontró una ruta de respuesta respaldada, no que WhatsApp carezca del dato.

La matriz Baileys clasifica `getcommunitysubgroups` como lectura candidata solo para comunidades conocidas; el último ciclo no tenía un destino elegible. `getusername` ya usa USync y exige una respuesta exacta de la propia identidad, pero no se obtuvo respuesta verificable. Para `getcontactprofile`, las dos rutas de icono son deliberadamente no equivalentes: WIS conserva una miniatura privada autenticada, no la URL temporal de WHAPI ni su imagen completa. `getnewchatlimit` mantiene como no equivalentes el estado de cap, cuota restante y fecha de actualización por falta de equivalencia de ciclo vigente. No rellenar esos campos con inferencias.

## Próxima ruta

Auditar otra operación WHAPI `GET` de bajo costo que tenga un getter Baileys público verificable; comparar contrato, campos exactos/semánticos y frescura antes de modificar código. No repetir la lectura del catálogo ni modificar etiquetas, conversaciones o la cuenta.
