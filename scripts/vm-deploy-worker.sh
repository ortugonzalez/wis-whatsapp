#!/usr/bin/env bash
# Routine worker deploy on the GCP VM (after git is set up).
set -euo pipefail

REPO="/home/soporte/apps/whatsapp-ui"
WORKER="$REPO/workers/whatsapp-baileys"

cd "$REPO"
git fetch origin main
git checkout main
git pull --ff-only origin main

cd "$WORKER"
npm install
npm run build
pm2 restart whatsapp-ui-baileys

echo "Worker deployed at $(git -C "$REPO" rev-parse --short HEAD)"
