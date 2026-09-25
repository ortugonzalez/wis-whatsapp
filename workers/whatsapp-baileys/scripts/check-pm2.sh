#!/usr/bin/env bash
set -eu
cd /home/soporte/apps/whatsapp-ui/workers/whatsapp-baileys
node -p "JSON.parse(require('fs').readFileSync('node_modules/baileys/package.json','utf8')).version"
pm2 restart whatsapp-ui-baileys
sleep 2
pm2 status whatsapp-ui-baileys
echo ---out---
tail -n 8 /home/soporte/.pm2/logs/whatsapp-ui-baileys-out.log
echo ---err---
tail -n 8 /home/soporte/.pm2/logs/whatsapp-ui-baileys-error.log