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

No se usó esta auditoría para enviar mensajes, cambiar perfiles, modificar grupos o activar integraciones. Las pruebas reales con efectos externos siguen sujetas a aprobación específica. El catálogo en el panel muestra el análisis y el próximo paso sin habilitar acciones nuevas.

Revisión 2026-09-27 sobre Baileys 7.0.0-rc14: 182 métodos cubiertos, 134 candidatos técnicos, 22 responsabilidades locales y 26 sin método público identificado. Las tres particiones y el generador/interfaz recibieron revisión independiente. Validación de referencias completa y build aprobados. Chrome mostró 182 filas, búsqueda y evidencia desplegable. Los estados de implementación permanecen en 43 parciales y 139 pendientes; no hubo reinicio ni operaciones remotas.
