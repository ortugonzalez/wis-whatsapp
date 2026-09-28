# Auditoría de viabilidad técnica

La matriz conserva dos ejes independientes:

- `status`: grado de implementación y evidencia de WIS. Revisar la biblioteca no convierte una función pendiente en implementada.
- `baileys_audit.support`: candidato técnico, responsabilidad local o método público no identificado en la versión instalada. Un candidato puede cubrir sólo parte del contrato WHAPI.

Cada candidato cita un símbolo y archivo del paquete instalado. La búsqueda de un símbolo prueba su presencia, no la equivalencia semántica, disponibilidad en la cuenta ni éxito de una operación real. La ausencia de un método público identificado tampoco prueba imposibilidad permanente.

Los tres archivos `docs/baileys-audit-*.json` contienen la revisión por función. `scripts/merge-baileys-audit.mjs` exige cobertura exacta de todos los IDs inventariados, rechaza duplicados y comprueba cada referencia antes de agregar la auditoría a `public/whapi-capabilities.json`. No modifica los estados de implementación.

Después de regenerar el inventario WHAPI o cambiar Baileys, revisar los mapeos y ejecutar:

```powershell
rtk proxy node scripts/merge-baileys-audit.mjs
```

El generador `snapshot-whapi.mjs` conserva la auditoría previa por ID, su fecha original y el estado/evidencia de implementación de métodos ya inventariados; regenerar el índice no equivale a revisarlo nuevamente. En una actualización con inventario previo, todos los IDs nuevos quedan pendientes y sin auditoría, incluso si coinciden con el mapa bootstrap estático. Ese mapa solo inicializa una instalación sin inventario previo. Los cambios de descripción o contrato requieren revisión aunque mantengan el ID. El generador rechaza índices vacíos, duplicados o inválidos antes de reemplazar el archivo mediante renombrado atómico, y resuelve las rutas desde el proyecto independientemente del directorio de ejecución. Las pruebas de regresión usan datos ficticios sin consultar WhatsApp ni modificar la matriz real.

No se usó esta auditoría para enviar mensajes, cambiar perfiles, modificar grupos o activar integraciones. Las pruebas reales con efectos externos siguen sujetas a aprobación específica. El catálogo en el panel muestra el análisis y el próximo paso sin habilitar acciones nuevas.

Si el índice omite un ID previamente inventariado, la regeneración se detiene y conserva el archivo anterior. Una eliminación real requiere revisar el cambio de catálogo antes de ajustar el inventario; una respuesta parcial nunca debe borrar silenciosamente auditorías. Regresión del generador: tres pruebas aprobadas; suite QA local: 16 pruebas aprobadas.

Revisión 2026-09-27 sobre Baileys 7.0.0-rc14: 182 métodos cubiertos, 134 candidatos técnicos, 22 responsabilidades locales y 26 sin método público identificado. Las tres particiones y el generador/interfaz recibieron revisión independiente. Validación de referencias completa y build aprobados. Chrome mostró 182 filas, búsqueda y evidencia desplegable. Conteo actual del inventario: 58 parciales, 123 pendientes y 1 no soportado. Estas etiquetas documentan implementación y evidencia; no afirman paridad completa.
