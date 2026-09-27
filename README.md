> Arquitectura actual: SQLite, sin Supabase ni Docker. Ver [manual SQLite](docs/sqlite-local.md). El contenido anterior debajo es histórico.

# WIS WhatsApp local

Implementación WIS sobre `mocte201/whatsapp-ui-template`. Guía vigente: [Operación local](docs/wis-local-runbook.md), [API](docs/api.md), [OpenAPI](docs/api.openapi.json).

El panel y el worker compilan. Los envíos y las campañas están deshabilitados. La conexión real requiere Supabase local disponible y que el propietario escanee el QR; no se declara vinculada la línea 5679 ni paridad completa con WHAPI.

El contenido que sigue describe la plantilla original como referencia histórica. Para WIS usar los comandos y puertos del runbook, nunca los destinos ni configuraciones históricas.

## Plantilla de origen

Multi-agent WhatsApp CRM template — shared inbox for WhatsApp Business numbers.

## Two pieces

| Piece | What | Where it runs |
|-------|------|---------------|
| **Panel** | Next.js app: login, inbox, settings | Vercel (local: `npm run dev`) |
| **Worker** | Baileys session + outbox/inbound | VM (GCP `e2-micro` Always Free) via PM2 |

The panel does **not** open WhatsApp. It reads/writes Postgres (Supabase) + Realtime. The worker is the only process holding the phone session.

Architecture: [`docs/architecture.md`](docs/architecture.md) · Plan: [`docs/implementation-plan.md`](docs/implementation-plan.md) · Agents: [`AGENTS.md`](AGENTS.md)

## Local setup (panel)

1. Copy `.env.example` → `.env.local` and fill:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (local: `http://localhost:3000`)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only: cleanup of non-allowlisted Auth users; **never** in browser)
2. In Supabase Dashboard → Authentication → Providers: enable **Google** (Client ID/Secret from Google Cloud).
3. Redirect URLs allowlist in Supabase Auth:
   - `http://localhost:3000/auth/callback`
   - `https://your-production-domain.com/auth/callback`
   - `https://*.your-preview-domain.vercel.app/auth/callback`
   - Login uses the **request host** (not only `NEXT_PUBLIC_SITE_URL`) so preview OAuth doesn't clash with production.
4. `npm install` && `npm run dev` → http://localhost:3000 (redirects to `/login` without session).

Scripts: `npm run build`, `npm run lint`, `npm start`.

## Auth

- Allowlist = rows in `public.profiles` (`is_active`). No row / inactive → no usable session.
- First Google login calls `link_my_profile()` and sets `user_id`.
- Initial seed: admin email you control; demo agent (replace with real office email).
- Roles: `admin` | `agent` in `profiles.role`.

## Data model (multi-tenant)

Tables: `sectors`, `sector_memberships`, `profiles`, `contacts`, `conversations` (`direct` | `group`), `messages`, `labels`, `conversation_labels`, `whatsapp_connections`, `whatsapp_outbox`. RLS on; `anon` no grants. Active members read their sector's inbox; outbound insert requires `sent_by` = own profile. Groups: attend only (no participant admin from CRM).

Media: private bucket `whatsapp-media` (signed URLs; no public CDN; includes `audio/webm` for voice notes from panel). Constant: `WHATSAPP_MEDIA_BUCKET` in `lib/supabase/types.ts`.

## WhatsApp channel

- Admin: `/settings/whatsapp` (QR, disconnect, send-test); `/settings/users` (allowlist CRUD, admin only).
- Worker: `workers/whatsapp-baileys/` on VM — see [`docs/whatsapp-baileys.md`](docs/whatsapp-baileys.md).
- **Optional Cloud API provider** (e.g., Kapso): sector-level `channel_provider = 'cloud'`, no VM, webhook + HTTP egress from panel.

## Supabase migrations

Files in `supabase/migrations/`. Apply to your projectRef with linked CLI (`supabase db push`) or MCP/`apply_migration`.

## Services (template defaults)

- Supabase project — **one** project, multi-sector
- Vercel project — **one** panel
- WhatsApp VMs: 1× `e2-micro` per Baileys sector (never 2 Baileys on same VM)

Server/worker secrets (`SUPABASE_SERVICE_ROLE_KEY`, Baileys auth dir, etc.) go in `.env.local` / Vercel server env / VM — **never real values in git**.

## ⚠️ Preview = Production Database

**This template uses a single Supabase project for all environments** (local, preview, production).

- Preview deployments share the **same database** as production
- Preview code mutations affect production data
- **Recommendation**: For real projects, provision a separate Supabase project for preview/staging

To enable preview isolation:
1. Create second Supabase project
2. Add `NEXT_PUBLIC_SUPABASE_URL_PREVIEW`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW` to Vercel Preview env
3. Modify `lib/supabase/server.ts` to select client by `process.env.VERCEL_ENV`
