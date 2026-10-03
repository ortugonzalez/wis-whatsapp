# Cobertura de contactos e identidades en producción

2026-10-03, ejecución 05:22 UTC. Paquete hasta `5a9f0b5`, con revisión independiente, suite 305/305 y 26/26 focales posteriores al ajuste de memoria. Árbol limpio antes del push al remoto productivo.

Precondiciones observadas: cero operaciones Procesando y cero En cola. Una sola implementación solicitada; EasyPanel informó Success a las 05:22:58 UTC. No hubo cambios de flags, permisos, credenciales ni cuenta. Estado posterior: HTTP 200, connected y error nulo.

Chrome verificó la matriz con filtros específicos: getidbylid usa `unambiguous_identity.pn`, 3749/3749 pares que cumplen el filtro; getcontact.name usa `contact.name`, 32/979 registros con 32 textos no vacíos. Ya no acredita el nombre mediante el display_name de respaldo. No se leyeron nombres ni identificadores. Las observaciones mantienen fecha de snapshot, sin garantizar vigencia actual.

El total sigue en 189 rutas observadas (14 exactas y 175 equivalencias) de 44628, con 44439 sin observar y 24/177 funciones con alguna ruta. Esto es esperable: había nombres reales y pares no conflictivos; la corrección mejora procedencia y exclusión, no crea información. No demuestra paridad funcional.

Captura de evidencia guardada fuera de Git. La inspección visual reveló que la tabla de campos estrecha mucho algunas columnas y parte palabras cortas; no impide verificar el dato, pero perjudica legibilidad. Próxima ruta: mejorar presentación de esta tabla conservando filtros, paginación y acceso a todos los metadatos; QA de escritorio y viewport estrecho antes de otro despliegue. Continuar recepción pasiva sin envíos de prueba.
