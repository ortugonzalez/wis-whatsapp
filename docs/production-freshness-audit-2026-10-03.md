# Auditoría de frescura productiva

Ejecución 2026-10-03 03:07 UTC, posterior al despliegue de asociaciones. Ruta 2: datos agregados reales en Chrome; no se leyó la base local como sustituto de producción.

EasyPanel conserva la implementación del selector. El panel muestra conexión con identidad verificada, lease vigente y recolector dentro del intervalo. Agregados: 974 contactos, 568 conversaciones, 1539 mensajes, 18 grupos con metadatos; 29 tipos de snapshots, 436 campos y 79 lecturas fallidas registradas. Los 14 entrantes de origen live siguen teniendo como última fecha de mensaje el 2 de octubre a las 12:06, hora de Buenos Aires. El aumento de contactos frente a la evidencia previa no demuestra recepción de nuevos mensajes.

La matriz productiva conserva 182 funciones/esquemas, 44628 rutas de respuesta, 189 observadas (14 exactas y 175 equivalencias), 44439 sin observar. Hay alguna observación en 24/177 funciones con respuestas y todas sus rutas en 4. No marcada obsoleta no significa frescura confirmada; ninguno de estos conteos prueba paridad funcional.

Hallazgo: la tarjeta secundaria de cobertura todavía decía «capturado en vivo» para la fecha original del mensaje, pese a la corrección previa del resumen principal. Se ajustó localmente a «Fecha del último entrante almacenado con origen live» y se explicó que no es hora de recepción. También se reemplazó «En vivo» por «Origen live» en la tabla. El origen puede incluir sincronización o repeticiones. No se cambió el cálculo ni la base.

Validación owner: sintaxis JavaScript y 25/25 pruebas de cobertura aprobadas. QA independiente PASS: distingue fecha, origen y recepción también sin fecha o sin registros; sintaxis aprobada, sin nuevos hallazgos. Se agrupa la corrección textual para el siguiente paquete; no hubo despliegue, reinicio, lecturas remotas adicionales ni cambios de cuenta en este turno.

Navegación: el clic al catálogo agotó el plazo; se verificó que permanecía en overview y se leyó el agregado DOM ya presente. El enlace directo conocido al catálogo funcionó y permitió auditar los conteos. No se repitió el clic fallido.

Próxima ruta: investigar por qué no hay evidencia reciente de entrada, diferenciando inactividad real, sincronización y recepción; revisar solo diagnósticos agregados del worker y correlación de eventos. No provocar envíos ni pedir otro QR. No repetir la consulta fallida de catálogo o bots sin un cambio justificable.
