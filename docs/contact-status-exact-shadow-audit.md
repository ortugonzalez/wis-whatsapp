# Estado de contacto y coincidencias homónimas — 2026-10-03 10:07 UTC

Frente 2/4. Worktree inicialmente limpio. Chrome muestra conexión verificada y
lease vigente, con cierre 428 registrado a las 07:00 BA y estado actual conectado;
no se reinició ni revinculó. Snapshot general 07:00 BA; último entrante live sigue
2/10 12:06 BA. EasyPanel conserva despliegue de las 09:26 UTC. Cero workers locales.

Inventario getcontact: 981 identificadores, 222 teléfonos, 32 nombres de libreta,
434 pushnames. status.status presente en 71 snapshots, texto no vacío en 38; no
equivale a 71 estados con texto. is_business, ambas fotos, phonebook y saved siguen
sin equivalencia demostrada. No se extrajeron valores personales.

Se encontró un defecto del comparador con regresión sintética: si existe el objeto
contact.status pero falta texto válido en status.status, el fallback de ruta exacta
podía acreditar el string WHAPI status. También podía considerar fresco el campo
por el objeto padre sin marca stale, aunque el alias estuviera obsoleto.

Corrección local: cuando hay una equivalencia revisada, sus candidatos son la única
fuente admitida; no se eluden sus requisitos con una ruta homónima. Backend y tabla
de campos comparten el criterio. El modal de esquema ya priorizaba candidatos.
La etiqueta de obsolescencia de la tabla también excluye evidencia raw descartada.
Es una reducción conservadora de posibles falsos positivos, no datos nuevos.

Regresión contra catálogo real: vacío no acredita campo, texto válido acredita
semánticamente, y stale/fresh del objeto raw no reemplaza la clasificación del
alias. Autor 15/15 focales; suite completa 322/322 PASS. Último ajuste de etiqueta
reverificado con 15/15 después. QA inicial independiente 9/9 PASS. No desplegado.
QA del delta final: 1/1 PASS, sin hallazgos.

Próxima ruta: completar revisión final y publicar el comparador corregido con
verificación de coherencia entre conteo por función y tabla de evidencia. No
solicitar de nuevo perfiles ni catálogo; reutilizar snapshots. La reconexión
observada no prueba recepción ni paridad WHAPI.
