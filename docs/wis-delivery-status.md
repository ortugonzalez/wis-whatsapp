> Arquitectura actual: SQLite, sin Supabase ni Docker. Ver [manual SQLite](sqlite-local.md). El contenido anterior debajo es histórico.

# Estado de entrega — 2026-09-27

Estado integral: **BLOCKED** por motor Docker Desktop no disponible. Código desarrollado y revisado; no se declara conexión real ni paridad total.

## Verificado

- Compilación Next.js 16.3.6 y TypeScript: PASS.
- ESLint completo: PASS.
- Worker: compilación y 4 pruebas offline: PASS.
- Webhooks y contrato n8n: 3 pruebas offline: PASS.
- Python: ambos ejemplos compilan.
- PostgreSQL embebido: 53 migraciones, seed y regresiones transaccionales: PASS.
- RLS Storage con dos sectores: lectura/escritura/encolado cruzados bloqueados: PASS.
- Auditoría de dependencias de producción: 0 vulnerabilidades reportadas.
- Pantalla /setup revisada en navegador. No hay datos simulados presentados como reales.
- QA independiente: ver `ops/reports/qa/wis-whatsapp-review.md`.

## Falta validar

- Supabase Docker: Auth, Realtime, Storage HTTP y bootstrap de administrador.
- ACL efectiva del entorno con credenciales generadas.
- QR, identidad real, sesión persistente y recibos en WhatsApp.
- Importación y ejecución controlada de los workflows en el n8n del usuario.
- Cobertura avanzada inventariada: consultar estado por método en el dashboard y catálogo JSON.

No se escaneó QR, enviaron mensajes, modificaron workflows de n8n ni desplegaron servicios. Campañas y dispatcher permanecen deshabilitados. Los cambios están en el repositorio independiente y su worktree, no integrados al Git raíz de WIS BOTS.
