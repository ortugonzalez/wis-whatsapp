# ADR 006 — Tesorería: sector Camino A + proyecto GCP propio

## Context

Había que sumar un tercer número WhatsApp (**Tesorería**, slug `tesoreria`) al CRM. El contrato multi-sector (ADR 005) ya fija Camino A: un repo, un panel, un Supabase. Contable ya consume el cupo Always Free e2-micro del proyecto `whatsapp-ui-acebal`. Tesorería opera bajo otra cuenta Google (`comunaacebal.tesoreria@gmail.com`) y no debe mezclar IP, SSH ni billing con Contable.

## Decision

- **Datos / panel:** mismo Supabase y mismo deploy Vercel; seed `sectors` + `whatsapp_connections` (`disconnected`) + membership admin; UI lee `display_name` de DB.
- **Worker:** VM e2-micro **nueva** en proyecto GCP **nuevo** (`whatsapp-ui-tesoreria`), región free-tier US, disco **`pd-standard`**, sin snapshots; un PM2 (`whatsapp-ui-baileys-tesoreria`) y `WHATSAPP_AUTH_DIR` propios. Orchestra: `services.whatsappVmTesoreria`.
- Se puede dejar el worker **up** (Realtime OK) **sin** escanear QR hasta que exista el número.

## Consequences

- Tres entradas VM en orchestra; nunca dos Baileys en una e2-micro.
- Egress Free sigue sumando por org Supabase al vincular Baileys (QR = follow-up explícito).
- Ops de creación free-tier documentados en `docs/runbook-whatsapp-vm.md` § Crear e2-micro Always Free (el estimador de consola muestra list price aunque el cupo aplique).
