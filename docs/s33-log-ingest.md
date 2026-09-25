# S33 — Log ingest Free

Meta: bajar Log Ingest de la org Acebal Municipio (Free 1 GB/ciclo) antes de 4 Baileys + Kapso.

## Hecho (2026-09-25)

### Worker whatsapp-ui (principal)

- RPC `worker_peek_pending(p_sector_id)` — un round-trip; idle no drena colas vacías.
- Safety poll default **120 s** (antes 90).
- Migración: `supabase/migrations/20260925160000_worker_peek_pending.sql` (aplicada remoto).

### Config Postgres `log_connections`

- `ALTER DATABASE … SET log_connections` **no aplica** en runtime Supabase (`cannot be set after connection start`).
- Follow-up humano (Dashboard → Database → Settings / Custom Postgres Config, o Management API) en proyectos **cobranzas** y **whatsapp-ui**: `log_connections=off`, `log_disconnections=off` si están on. Ver [docs](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest).

## Medición

- Baseline pre-S33 Contable: ~19k `edge_logs`/24h (casi todo `| node`).
- Post-redeploy: esperar ≥2–3 h idle y comparar `edge_logs` + Usage → Log Ingest.
- Egress org seguía ~4% el 2026-09-25 — no es el bloqueo.
