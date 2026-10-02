# Auditoría agregada de producción

2026-10-02, 21:37 UTC aproximadamente. Ruta 2: comparación de variables y frescura. Lectura en Chrome del dashboard productivo; no se consultó la base local ni se forzaron lecturas a WhatsApp.

Vista general: 963 contactos, 568 conversaciones, 1539 mensajes y 18 grupos almacenados. Perfil actualizado a las 18:24 de Argentina. 1000 eventos retenidos, cero operaciones pendientes y cero fallidas. Los conteos son acumulados; no prueban recepción reciente.

Catálogo: 182 funciones y esquemas; 177 funciones con rutas de respuesta. 44628 rutas de respuesta documentadas, 188 observadas: 14 exactas y 174 equivalencias revisadas. 44440 sin observar. 23 funciones con alguna ruta observada; 4 con todas sus rutas documentadas observadas. Ninguno de esos conteos demuestra implementación completa de una función. El catálogo de parámetros, solicitudes y respuestas contiene 60006 definiciones.

Frescura: las 188 rutas tienen evidencia no marcada obsoleta, cero solo evidencia marcada obsoleta. La interfaz advierte correctamente que ausencia de marca obsoleta no demuestra vigencia. El cálculo fue mostrado a las 18:37 de Argentina y la referencia fechada el 1 de octubre a las 11:37. Una fecha de cálculo nueva no renueva la observación subyacente.

No se muestran valores personales ni identificadores en esta evidencia. Sin envío, cambio de cuenta, reinicio o despliegue en esta auditoría. Worktree limpio al iniciar. La corrección anterior del worker tiene su evidencia en outbound-ownership.md.

Próxima ruta 4: evaluar un indicador explícito de última recepción y antigüedad en la vista general, usando timestamps ya persistidos y separando recepción de importación histórica, actualización de perfil y estado conectado. Si no existe timestamp confiable de recepción, mostrar desconocido en vez de inferirlo del último mensaje.
