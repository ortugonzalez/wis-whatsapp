#!/usr/bin/env bash
# One-time: migrate VM worker tree to git clone. Preserves auth/ + .env.
set -euo pipefail

APPS="/home/soporte/apps"
REPO="$APPS/whatsapp-ui"
WORKER="$REPO/workers/whatsapp-baileys"
BACKUP="$HOME/backups/whatsapp-worker-$(date +%Y%m%d-%H%M%S)"
DEPLOY_KEY="$HOME/.ssh/whatsapp_ui_deploy"
GITHUB_HOST="github.com"

mkdir -p "$HOME/.ssh" "$HOME/backups"
chmod 700 "$HOME/.ssh"

if [[ ! -f "$DEPLOY_KEY" ]]; then
  echo "Missing deploy key: $DEPLOY_KEY" >&2
  exit 1
fi

chmod 600 "$DEPLOY_KEY"

cat > "$HOME/.ssh/config" <<EOF
Host ${GITHUB_HOST}
  HostName ${GITHUB_HOST}
  User git
  IdentityFile ${DEPLOY_KEY}
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
chmod 600 "$HOME/.ssh/config"

mkdir -p "$BACKUP"
if [[ -d "$WORKER/auth" ]]; then
  cp -a "$WORKER/auth" "$BACKUP/"
fi
if [[ -f "$WORKER/.env" ]]; then
  cp "$WORKER/.env" "$BACKUP/"
fi
echo "Backup at $BACKUP"

if [[ -d "$REPO/.git" ]]; then
  echo "Already a git clone at $REPO"
else
  STAMP=$(date +%Y%m%d-%H%M%S)
  if [[ -d "$REPO" ]]; then
    mv "$REPO" "${REPO}.pre-git-${STAMP}"
    echo "Moved old tree to ${REPO}.pre-git-${STAMP}"
  fi
  git clone --depth 1 --branch main "git@${GITHUB_HOST}:Acebal-Municipio/whatsapp-ui.git" "$REPO"
fi

if [[ -d "$BACKUP/auth" ]]; then
  rm -rf "$WORKER/auth"
  cp -a "$BACKUP/auth" "$WORKER/"
fi
if [[ -f "$BACKUP/.env" ]]; then
  cp "$BACKUP/.env" "$WORKER/.env"
  chmod 600 "$WORKER/.env"
fi

cd "$WORKER"
npm install
npm run build
pm2 restart whatsapp-ui-baileys || pm2 start dist/index.js --name whatsapp-ui-baileys --cwd "$WORKER"
pm2 save || true

echo "Deploy OK — $(git -C "$REPO" rev-parse --short HEAD)"
