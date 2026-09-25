# Runbook — VM WhatsApp (GCP)

Ops del worker Baileys. Diseño: [`architecture.md`](architecture.md). Decisión: [`adr/001-worker-gcp-e2-micro.md`](adr/001-worker-gcp-e2-micro.md).

## Salud anti-Meta (S32)

Antes de sumar sockets Baileys o bajar log ingest en flota: checklist + evidencia en [`s32-salud-anti-meta.md`](s32-salud-anti-meta.md). Contable + Kapso vivos; eq-técnico/Tesorería sin QR = OK.

## Datos vivos

Fuente de verdad: `.cursor/orchestra.json` → `services.whatsappVm` (Contable), `services.whatsappVmEqTecnicoCentros` (2ª VM), `services.whatsappVmTesoreria` (3ª VM) y `services.whatsappVmTurnosSamco` (VM SAMCO; cuenta Google distinta). Campos: `host`, `user`, `appsPath`, `sshKeyName`, `pm2Name`, `sectorSlug`, `authDirHint`. No copiar IPs acá si el orchestra ya las tiene.

## SSH (desde la PC de ops)

```powershell
ssh -i $env:USERPROFILE\.ssh\<sshKeyName> <user>@<host>
```

Clave privada solo en la máquina local; nunca en el repo. Si `Permission denied (publickey)`, la clave pública debe estar en `~/.ssh/authorized_keys` del usuario en la VM (las claves `google-ssh` del navegador son temporales).

## Estado base esperado

- Debian/Ubuntu cloud, swap ~1G, Node ≥ 20 (hoy 22 LTS), PM2 global, `pm2-soporte` (o equivalente) **enabled**.
- Apps bajo `appsPath` (hoy `/home/soporte/apps/whatsapp-ui`).
- Sin HTTP/HTTPS abiertos al público para el flujo de mensajes (outbox vía Supabase; wake del worker = Realtime outbound + poll seguridad, **no** webhook inbound).

## Crear e2-micro Always Free (consola 2026)

La UI de “Crear instancia” es un wizard de **7 pestañas**. El estimador de la derecha muestra **precio de lista** (~USD 6–7/mes para e2-micro) y **no resta** el cupo Always Free: no implica que vaya a facturar si la config es elegible.

### Checklist free-tier (obligatorio)

| Ítem | Valor free-tier | Trampa habitual |
| --- | --- | --- |
| Tipo de máquina | `e2-micro` (serie E2) | Otra serie / más RAM |
| Región | `us-central1`, `us-west1` o `us-east1` | Región fuera de US free |
| Disco de arranque | **Disco persistente estándar** (`pd-standard`), ≤ 30 GB | Default = **balanceado** (`pd-balanced`) → **cobra** (~USD 1/10 GB) |
| Snapshots / backups | **Sin copias de seguridad** | Default puede traer programación de instantáneas → storage cobrable |
| Firewall | HTTP/HTTPS **desmarcados** (este producto no necesita) | Allow HTTP/HTTPS abiertos sin necesidad |
| Provisioning | Standard (no Spot/preemptible para el cupo “1 e2-micro non-preemptible”) | — |

Pasos en la consola:

1. **Configuración de la máquina:** nombre, región/zona US free, serie E2 → `e2-micro`.
2. **SO y almacenamiento → Cambiar:** SO Debian/Ubuntu; **Tipo de disco = Disco persistente estándar**; tamaño 10 GB (o ≤ 30). Verificar en el estimador: disco → **USD 0.00**.
3. **Protección de datos:** elegir **Sin copias de seguridad** (no dejar “Programaciones de instantáneas”).
4. **Redes:** sin Allow HTTP/HTTPS.
5. **Observabilidad / Seguridad / Avanzado:** defaults OK.
6. **Crear.** Confirmar en Detalles del disco: `Tipo = Disco persistente estándar`.

Equivalente gcloud (misma cuenta/proyecto; no mezclar proyectos Contable/Tesorería):

```bash
gcloud compute instances create <instance-name> \
  --project=<gcp-project-id> \
  --zone=us-central1-a \
  --machine-type=e2-micro \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard
```

### Tras crear la VM

1. Clave SSH **permanente** en Metadatos del proyecto → Claves SSH (usuario `soporte`). Las del botón SSH del navegador (`google-ssh`) son temporales.
2. Bootstrap: swap ~1G, Node ≥ 20, PM2 + `pm2 startup` / `pm2-soporte` enabled, git, deploy key read-only al repo, clone en `appsPath/whatsapp-ui`.
3. `.env` del worker (`chmod 600`) con `SECTOR_SLUG` + `WHATSAPP_AUTH_DIR` propios; `pm2 start` con el `pm2Name` de orchestra; `pm2 save`.
4. Actualizar orchestra: `host`, `enabled: true`. QR Baileys solo cuando el número exista (puede quedar `disconnected`).

### Proyecto GCP por cuenta

- Contable: proyecto `whatsapp-ui-acebal` (ver `whatsappVm`).
- Tesorería: cuenta `comunaacebal.tesoreria@gmail.com`, proyecto **nuevo** `whatsapp-ui-tesoreria` (ver `whatsappVmTesoreria`). **No** reutilizar IP, clave SSH ni proyecto de Contable.

## Worker S18a (egress)

Tras deploy del worker event-driven:

1. En logs PM2: `wake: realtime+safety_poll`, `worker_realtime_status` → `SUBSCRIBED`.
2. Idle ~1 h: en Supabase Logs Explorer, REST a `whatsapp_*_ops` / `whatsapp_outbox` / `whatsapp_connections` debe caer órdenes de magnitud vs ~40k/tabla/día.
3. Smoke: enviar mensaje desde el CRM y confirmar drain en segundos (sin esperar el poll de 90 s).
4. Opcional: `WORKER_SAFETY_POLL_MS` en `.env` del worker (default **120000** tras S33; rango 60000–120000). Idle usa `worker_peek_pending` para no drenar colas vacías.

## Después de un reboot

```bash
free -h          # Swap visible
pm2 status       # Tras S4: proceso whatsapp-ui-baileys
node -v
```

## Deploy del worker

Repo git en la VM: `appsPath/whatsapp-ui` (branch `main`). Deploy key read-only → GitHub (`~/.ssh/whatsapp_ui_deploy`).

### Rutina

En la VM:

```bash
~/bin/deploy-whatsapp-worker.sh
```

Desde la PC de ops (SSH + pull/build/restart; reemplazar `<sshKeyName>`, `<user>`, `<host>` desde orchestra):

```powershell
ssh -i $env:USERPROFILE\.ssh\<sshKeyName> <user>@<host> "cd /home/soporte/apps/whatsapp-ui && git pull --ff-only origin main && cd workers/whatsapp-baileys && npm install && npm run build && pm2 restart whatsapp-ui-baileys"
```

Manual (shell en la VM):

```bash
cd /home/soporte/apps/whatsapp-ui
git pull --ff-only origin main
cd workers/whatsapp-baileys
npm install && npm run build
pm2 restart whatsapp-ui-baileys
```

`auth/` y `.env` **no** están en git; `git pull` no los toca.

### Primera vez / migración

Script en repo: `scripts/vm-migrate-to-git.sh` (backup `auth/` + `.env`, clone, restore, build, restart).

Slice S4 / **hermes-baileys**: env `chmod 600`, `pm2 start` con `pm2Name`, `pm2 save`. No documentar secretos aquí — solo nombres (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SECTOR_SLUG`, `WHATSAPP_AUTH_DIR`, …).

## Multi-sector (S23)

ADR: [`005-multi-sector.md`](adr/005-multi-sector.md). **Una VM e2-micro = un sector = un PM2 Baileys = un `WHATSAPP_AUTH_DIR`.** Nunca dos procesos Baileys en la misma e2-micro (ADR 001).

### Orchestra

| Entrada | Sector | Estado |
| --- | --- | --- |
| `services.whatsappVm` | `contable` | Viva (`host` + `pm2Name`) |
| `services.whatsappVmEqTecnicoCentros` | `eq-tecnico-centros` | Placeholder (`enabled: false`, `host: null`) hasta provisionar |
| `services.whatsappVmTesoreria` | `tesoreria` | Viva (proyecto GCP `whatsapp-ui-tesoreria`; worker up; **QR pendiente** hasta tener el número) |
| `services.whatsappVmTurnosSamco` | `turnos-samco` | Viva (cuenta `facturacionsamcoacebal@gmail.com`; SSH `id_ed25519_guardia_samco_wa`; PM2 `whatsapp-ui-baileys-turnos-samco`). **Un solo** Baileys (no reactivar `guardia-samco-wa`). QR vía Settings del CRM. |

### Env por worker (nombres)

En `.env` del worker (chmod 600): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SECTOR_SLUG`, `WHATSAPP_AUTH_DIR`, opcional `BAILEYS_LOG_LEVEL`, `WORKER_SAFETY_POLL_MS`.

- Contable: `SECTOR_SLUG=contable`, auth bajo `authDirHint` de `whatsappVm`.
- Técnico: `SECTOR_SLUG=eq-tecnico-centros`, auth **distinto** (`authDirHint` de `whatsappVmEqTecnicoCentros`).
- Tesorería: `SECTOR_SLUG=tesoreria`, auth **distinto** (`authDirHint` de `whatsappVmTesoreria`). Misma org Supabase (Camino A); **no** mezclar IP, proyecto GCP ni clave SSH con Contable.

Al arrancar, el log `worker_start` debe incluir `sectorSlug` + `sectorId` (sin secretos).

### Redeploy Contable (urgente post-S19)

Tras merge o desde branch de trabajo (hoy `feature/multi-sector-s19-s23` hasta merge a `main`):

```bash
cd /home/soporte/apps/whatsapp-ui
# Preferir main tras merge; hasta entonces:
git fetch origin && git checkout feature/multi-sector-s19-s23 && git pull --ff-only
cd workers/whatsapp-baileys
# Asegurar SECTOR_SLUG=contable en .env (no commitear)
grep -q '^SECTOR_SLUG=' .env || echo 'SECTOR_SLUG=contable' >> .env
npm install && npm run build
pm2 restart whatsapp-ui-baileys
pm2 logs whatsapp-ui-baileys --lines 40 --nostream
```

Smoke: log `sectorSlug":"contable"`; enviar mensaje desde CRM Contable y ver drain; Realtime `SUBSCRIBED`.

### Checklist — 2ª e2-micro (`eq-tecnico-centros`)

No provisionar ni vincular Baileys hasta que el número esté listo para uso (egress). Cuando sí:

1. GCP: nueva Always Free `e2-micro` en `us-central1`, mismo proyecto `whatsapp-ui-acebal` (o free-tier region). Swap ~1G, Node ≥ 20, PM2, usuario `soporte`, clave SSH (misma o nueva → actualizar `sshKeyName` si hace falta).
2. Clone repo en `appsPath/whatsapp-ui`; deploy key read-only.
3. `.env` worker: mismos Supabase secrets + `SECTOR_SLUG=eq-tecnico-centros` + `WHATSAPP_AUTH_DIR` apuntando a dir **vacío** dedicado (no copiar `auth/` de Contable).
4. `pm2 start` con `pm2Name` de orchestra (`whatsapp-ui-baileys-eq-tecnico`); `pm2 save`; **enabled** en esa VM sola.
5. Actualizar orchestra: `host`, `enabled: true` en `whatsappVmEqTecnicoCentros`.
6. En el panel (admin, sector activo técnico): Connect → QR. Smoke inbound/outbound solo en filas de ese sector.
7. Confirmar que la VM Contable sigue con **un** solo PM2 Baileys.

### Checklist — 3ª e2-micro (`tesoreria`)

Cuenta Google **`comunaacebal.tesoreria@gmail.com`**, proyecto GCP **nuevo** (no reutilizar `whatsapp-ui-acebal` ni la IP/clave de Contable). Seguí § **Crear e2-micro Always Free** arriba (`pd-standard`, sin snapshots).

**Estado (2026-09):** VM + worker PM2 provisionados; sesión Baileys **sin** QR. Pasos históricos:

1. Login Gmail Tesorería → proyecto `whatsapp-ui-tesoreria` → Always Free `e2-micro` `us-central1` · disco **estándar** · sin HTTP/HTTPS · sin backups.
2. Usuario SSH `soporte` + clave permanente `hermes_gcp_whatsapp_ui_tesoreria_ed25519`. Swap ~1G, Node ≥ 20, PM2 + startup.
3. Clone repo; deploy key read-only propia de esta VM.
4. `.env` worker: secrets Supabase (Camino A) + `SECTOR_SLUG=tesoreria` + `WHATSAPP_AUTH_DIR` = `auth-tesoreria`. `chmod 600`.
5. `pm2 start` / `pm2Name` `whatsapp-ui-baileys-tesoreria`; `pm2 save`.
6. Orchestra: `host`, `enabled: true` en `whatsappVmTesoreria`.
7. Done sin número: PM2 up + `worker_start` `sectorSlug":"tesoreria"` + Realtime `SUBSCRIBED`.
8. **Follow-up (cuando exista el número):** admin → sector Tesorería → Connect → QR → smoke inbound/outbound solo en filas `tesoreria`.

### Checklist — VM Turnos · SAMCO (`turnos-samco`)

Cuenta Google **`facturacionsamcoacebal@gmail.com`**. Orchestra: `whatsappVmTurnosSamco`. SSH: `id_ed25519_guardia_samco_wa` → `soporte@<host>`.

**Estado (2026-09-25):** clone `whatsapp-ui` (branch `ship/s32-s35-fleet-turnos`), `.env` `SECTOR_SLUG=turnos-samco`, PM2 `whatsapp-ui-baileys-turnos-samco` online + Realtime `SUBSCRIBED`. El PM2 interim `guardia-samco-wa` (repo guardia_samco) se **apagó** a propósito — ADR 001: un solo Baileys en la e2-micro; dual-DB llega en S35.

1. Deploy key read-only `whatsapp_ui_deploy` en la VM (Host `github.com-whatsapp-ui`); no pisar Host `github.com-municipio` de guardia_samco.
2. Auth dir dedicado `auth-turnos-samco` (vacío hasta pair).
3. Admin: sector **Turnos · SAMCO** → Settings → WhatsApp → Connect / escanear QR.
4. Smoke: outbox CRM a `+5493469690201` (o número de prueba) → sent/delivered; inbound path.
5. **No** `pm2 start guardia-samco-wa` en paralelo.
