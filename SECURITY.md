# Security — WhatsApp CRM Template

## Secret Rotation

Rotate these secrets **per deployment** (never reuse across projects/environments).

| Secret | Where to Rotate | Frequency |
|--------|-----------------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → **Reset service_role key** | Per deploy / on leak |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → **Reset anon key** | Per deploy / on leak |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → General (if project recreated) | Project recreation only |
| `CLOUD_API_KEY` / `CLOUD_PHONE_NUMBER_ID` / `CLOUD_WEBHOOK_SECRET` | Cloud provider panel (e.g., Kapso) → Settings → **Regenerate** | Per deploy / on leak |
| `VERCEL_OIDC_TOKEN` / Vercel deploy tokens | Vercel Dashboard → Settings → Tokens → **Revoke & create new** | Per deploy / on leak |
| Worker `SUPABASE_SERVICE_ROLE_KEY` (VM `.env`) | Same as Supabase above; update VM `.env` after rotation | Per deploy / on leak |

## Rotation Procedure

1. **Generate new secret** in provider dashboard
2. **Update** in target environment:
   - Vercel: Project Settings → Environment Variables
   - VM: Edit `.env` (chmod 600), restart PM2: `pm2 restart whatsapp-ui-baileys`
   - Local: `.env.local`
3. **Verify** smoke test:
   - Panel: login → inbox loads → send test message
   - Worker: `pm2 logs` shows `connected` + drain working
4. **Revoke old** only after new works

## Preview vs Production Database

**This template uses a single Supabase project for all environments** (local, preview, production).

- Preview deployments share the **same database** as production
- Preview code mutations affect production data
- **Recommendation**: For real projects, provision a separate Supabase project for preview/staging

To enable preview isolation:
1. Create second Supabase project
2. Add `NEXT_PUBLIC_SUPABASE_URL_PREVIEW`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW` to Vercel Preview env
3. Modify `lib/supabase/server.ts` to select client by `process.env.VERCEL_ENV`

## Baileys Worker VM Hardening

- `WHATSAPP_AUTH_DIR` stores session credentials (unencrypted)
- **Recommended**: Use encrypted disk (GCP: `pd-standard` with CSEK) or at minimum:
  ```bash
  chmod 700 /path/to/auth
  chown -R user:user /path/to/auth
  ```
- SSH: key-only auth, disable password, non-root user
- PM2: `pm2 start ecosystem.config.cjs --no-daemon` under dedicated user

## Media Upload Validation

Current implementation validates MIME type via `file.type` + extension. **No magic-bytes verification**.

For production hardening, add `file-type` package:
```bash
npm install file-type
```
```ts
import { fileTypeFromBuffer } from "file-type";
const buf = Buffer.from(await file.arrayBuffer());
const type = await fileTypeFromBuffer(buf);
if (!type || !ALLOWED_MIME.has(type.mime)) throw new Error("Invalid file type");
```

## Kapso Webhook Security

- HMAC-SHA256 verified with `crypto.timingSafeEqual` (constant-time)
- Idempotency key per delivery prevents replay
- Raw body required for signature verification

## RLS Summary

All user-facing tables have RLS enabled with sector-scoped policies:
- `member_of_sector(sector_id)` helper enforces multi-tenant isolation
- `service_role` bypasses RLS (worker, admin cleanup only)
- `anon` has zero grants on all tables

## Rate Limiting (Not Included)

Template does not include rate limiting. For production, add:
- Vercel Edge Middleware for `/api/auth/*`, `/api/whatsapp/*`
- Upstash Redis or in-memory token bucket
- Supabase Auth provider limits (Google OAuth)

## Dependency Scanning

Add to CI:
```bash
pnpm audit --prod
# or
npm audit --production
```

## Security Headers

Configured in `next.config.ts`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- CSP: restrictive default (adjust for your integrations)

## Cookie Security

Sector cookie (`wa_active_sector`):
- `httpOnly: true`
- `secure: true` (production only)
- `sameSite: 'lax'`
- `maxAge: 30 days`
- Path: `/`

## Residual Risks

| Risk | Mitigation |
|------|------------|
| Preview = Production DB | Provision separate Supabase project for preview |
| Baileys auth dir unencrypted | Encrypt VM disk or use CSEK |
| No rate limiting on auth endpoints | Add Vercel Edge middleware |
| Media upload MIME only (no magic bytes) | Add `file-type` validation in production |
| Single Supabase project for all envs | Separate projects per environment |

## Reporting

Security issues: open a private GitHub Security Advisory or email the maintainer.