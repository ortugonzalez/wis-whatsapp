# Pipeline Hermes (copia en este repo)

**Fuente de verdad:** el control plane (Orchestrator) → `templates/pipeline/`.  
Estos archivos se refrescan con el sync; **no** los edites a mano en el proyecto (se pisan o se omiten en la próxima sync).

| Archivo | Uso |
| --- | --- |
| [comments.md](comments.md) | Qué escribís vos en el PR: `APROBADO` / `REHACER` / `DECISIONES` |
| [issue-body.md](issue-body.md) | Plantilla al abrir un Issue pendiente |
| [labels.json](labels.json) | Definición de etiquetas `hermes/*` (las creás vía script del Orchestrator) |
| [automation-plan.prompt.md](automation-plan.prompt.md) | Texto a pegar en la Automation **Plan** de Cursor |
| [automation-implement.prompt.md](automation-implement.prompt.md) | Texto a pegar en la Automation **Implement** |

## Después de un sync

1. **Commiteá** `.cursor/pipeline/` (y skills si también sincronizaste):
   ```text
   git add .cursor/pipeline .cursor/skills
   git commit -m "chore: sincronizar pipeline y skills Hermes"
   ```
2. Si usás el **workflow** Hermes: asegurate el secret `CURSOR_API_KEY` en GitHub del repo (Settings → Secrets → Actions). No hace falta re-pegar Automations de Cursor.
3. Si cambiaron prompts y solo usás launch local desde Orchestrator: no hace falta nada más (el script lee `templates/pipeline/`).
4. Si cambió `labels.json`: desde el Orchestrator:
   ```powershell
   powershell -NoProfile -File scripts/hermes-pipeline-labels.ps1 -Repo "owner/este-repo"
   ```

## Disparo del agent

Preferido: Cloud Agents API (script en Orchestrator o este workflow). Ver docs del control plane: `docs/pipeline-cloud-agents-api.md`.

## Labels la primera vez

Las labels viven en GitHub, no solo en este archivo. Crearlas es un paso aparte (script del Orchestrator), no del sync de archivos.
