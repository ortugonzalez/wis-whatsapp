# ADR 005 — Multi-sector (dos números, un repo)

## Context

El municipio necesita un segundo número WhatsApp para otro sector (`eq-tecnico-centros`), sin compartir agentes con Contable, manteniendo **un solo repo** y un solo panel (mismo dominio). El contrato v1–v18 era single-tenant: `whatsapp_connections` singleton, RLS “cualquier activo ve todo”.

## Decision

- **Camino A:** mismo proyecto Supabase; multi-tenant lógico por `sectors` + membership; **Camino B** (otro proyecto/org Free) solo si el egress de org lo exige tras operar dos workers.
- Un repo / un deploy Vercel; **2× e2-micro** (1 PM2 Baileys + auth dir por sector).
- Slugs: `contable` (número ya vinculado; migra datos actuales), `eq-tecnico-centros`, `tesoreria` (nuevos vacíos). UI: **Contable** / **Equipo técnico · centros** / **Tesorería**.
- Aislamiento total de datos WA por sector; `profiles` global; `sector_memberships`.
- Admin global (`your-admin@domain.com`): QR de todos + memberships. Agentes: bandeja según membership.
- RLS por membership; sector activo en cookie/sesión; choose-on-login si >1 sector; switcher in-app sin re-OAuth.
- Wave se diseña/implementa **en paralelo** a S18; no vincular Baileys de un sector nuevo hasta querer usarlo (ahí suma egress de la misma org).
- Tesorería: misma org Supabase (Camino A); VM en proyecto GCP **nuevo** bajo `comunaacebal.tesoreria@gmail.com` (no reutilizar Contable).

## Consequences

- Quitar singleton de `whatsapp_connections`; toda fila WA lleva `sector_id`.
- Orchestra: segunda entrada VM; secrets/env `SECTOR_SLUG` + `WHATSAPP_AUTH_DIR` por worker.
- Settings usuarios/WhatsApp scoped a membership / sector activo.
- Fuera de MVP: admin-de-sector, 2 repos, 2 PM2 en una e2-micro, contactos compartidos entre sectores.
