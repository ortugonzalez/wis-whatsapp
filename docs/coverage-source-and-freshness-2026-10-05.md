# Procedencia del comparador WHAPI — 2026-10-05

Ruta 4, tras separar la base local del checkout de la instancia productiva.
El worktree comenzó limpio en `9d8e771`. Chrome mostró la línea conectada,
identidad verificada, cero operaciones pendientes/fallidas y un último evento
del 5 de octubre a las 05:46, hora de Buenos Aires. La última notificación
entrante y el último entrante almacenado seguían en el 3 de octubre a las
09:33; no se demostró recepción reciente. EasyPanel mostraba como último
despliegue el cambio de marcas de recibo del 3 de octubre. Se revisaron solo
agregados y estado del servicio; no se inició ninguna lectura Baileys.

La API autenticada de cobertura WHAPI calculaba la matriz desde la SQLite del
servicio y fechaba el *cálculo*, pero omitía el origen y la fecha de escritura
más reciente de los snapshots. Esto podía hacer que un cálculo reciente se
interpretase como datos recién recibidos. Ahora responde
`source_database: service_sqlite` y `latest_snapshot_updated_at` (o `null`).
La vista identifica esa fuente como SQLite de la instancia y aclara que la
última escritura global puede corresponder a otra ruta; cada variable conserva
su marca individual de snapshot. La fecha del cálculo no prueba frescura.

Verificación local: build correcto, 335/335 tests y `git diff --check` limpio.
El test autenticado comprueba origen y fecha con un snapshot sintético, sin
contenido personal. QA independiente: PASS, sin hallazgos P0–P2; confirmó
autorización de lectura, respuesta sin valores privados y aclaración de alcance
en la vista. No consultó producción. El máximo presupone marcas ISO homogéneas;
una fecha inválida se expone como `null`, sin inventar frescura. No se declara
paridad WHAPI.

El commit `c5d3a3c` se envió al remoto productivo y se desplegó en el servicio
existente. EasyPanel registró `Success` a las 09:07:48 UTC. Durante el reinicio,
el dominio mostró temporalmente «Service is not reachable»; después volvió a
servir el dashboard autenticado con línea conectada, cero operaciones pendientes
y último evento a las 06:08 hora de Buenos Aires. La última notificación y el
último entrante almacenado seguían en el 3 de octubre a las 09:33. La vista
general confirma recuperación del servicio, pero la tabla de comparación WHAPI
no pudo abrirse en Chrome en este turno; por ello no se afirma verificación
visual del nuevo texto ni una lectura actualizada de la matriz productiva.

Próxima ruta: 5, comprobar mediante la navegación normal del panel el origen y
la fecha de snapshot de la matriz desplegada, sin repetir la interacción del
diagnóstico que agotó el tiempo. Mantener separadas las marcas de recepción,
la actividad del worker y la cobertura de campos.

## Verificación visual — 09:14 UTC

Con la navegación normal «Más herramientas → Catálogo de funciones», Chrome
mostró en producción el nuevo rótulo «Fuente: SQLite de esta instancia» y la
última escritura global de snapshot a las 06:08 hora de Buenos Aires. El
cálculo de la matriz figuraba a las 06:14; son tiempos distintos. La matriz
productiva indicó 190/44.628 rutas de respuesta con observación (13 exactas,
177 semánticas), 44.438 sin observar, 24/177 funciones con alguna ruta y cuatro
completas. Todas las 190 estaban no marcadas obsoletas; ello no confirma que
cada dato se actualizara a las 06:08. La base local del checkout seguía en
139/44.628, con último snapshot del 28 de septiembre, y no se mezcló con esos
conteos. No se pulsaron lecturas ni acciones de cuenta.

En la vista general, la última notificación y el último entrante almacenado
seguían en el 3 de octubre a las 09:33 hora de Buenos Aires, aunque la línea
figuraba conectada. La verificación del rótulo queda cerrada; la recepción
reciente y las 44.438 rutas no observadas mantienen abierta la brecha WHAPI.
Próxima ruta: 1, inspeccionar lease, reconexión y actividad pasiva del proceso
con las señales ya guardadas, sin reiniciar ni duplicar el worker.
