# Agents — whatsapp-ui-template

## Work order

1. **hermes-arquitecto** — `docs/architecture.md` + `docs/implementation-plan.md` with `status: approved` (ready)
2. **hermes-ship-plan** — next slice (or **hermes-escritor** for a one-off change) + smoke
3. On demand: **hermes-revisor**, **hermes-documentador**, **hermes-seguridad**, **hermes-optimizador**, **hermes-depurador**, **hermes-lanzamiento**, **hermes-ux-mobile**, **hermes-ux-surfaces**, **hermes-a11y**, **hermes-simplificador**, **hermes-fuente**, **hermes-duda**, **hermes-observabilidad**, **hermes-baileys** (WhatsApp channel, slice S4)

## Skills

Live in `.cursor/skills/hermes-*`. Committed on purpose: a cloud agent only sees what's in the clone, not Percy's `~/.cursor`.

## Hermes Pipeline

Templates in `.cursor/pipeline/`. Update from Orchestrator:

```powershell
powershell -NoProfile -File <orchestrator-path>\scripts\hermes-sync-skills.ps1 -Target repo -Path <this-repo-path>
```

`hermes-doctor`, `hermes-iniciador`, `hermes-forjador` are **not** here: they're local to the machine / control plane.

## Profile

- **personal** → GitHub `YOUR_OWNER`, remote `git@github.com:YOUR_OWNER/whatsapp-ui-template.git`
- Folder: your local path

## Secrets

`orchestra.json` lists **names** of variables. Values: local `.env` (gitignored) and Cursor dashboard for cloud agents. Never in the repo.

Supabase projectRef: your projectRef.

Worker VM: GCP `e2-micro` per sector — configure in `orchestra.json` and `docs/runbook-whatsapp-vm.md` (Always Free: `pd-standard`, no snapshots).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->