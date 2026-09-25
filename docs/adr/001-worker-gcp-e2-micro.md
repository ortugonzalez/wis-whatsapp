# ADR 001 — Worker Baileys en GCP e2-micro

## Context

El contrato v1 asumía Oracle Always Free (ARM). La VM personal Oracle ya corre otros productos; mezclar Acebal ahí era riesgo operativo. Una PC local apagada de noche deja huecos de sync. Hacía falta un host 24/7 barato y separado.

## Decision

Correr el worker en **GCP Compute Engine Always Free `e2-micro`** (proyecto `whatsapp-ui-acebal`, región free-tier `us-central1`), usuario SSH `soporte`, PM2 `whatsapp-ui-baileys`. Datos en `.cursor/orchestra.json` → `services.whatsappVm`.

## Consequences

- 1 GB RAM: swap de 1 GB obligatorio; un solo proceso de producto en la VM.
- Free tier solo en regiones US indicadas; egress ~1 GB/mes — monitorear media.
- `hermes-baileys` Fase C usa esta VM (no Oracle).
- Contrato y README actualizados; Oracle queda descartado para este producto.
