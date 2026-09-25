# Worker Baileys

Canal WhatsApp del CRM. Corre **solo** en la VM GCP (`e2-micro`), bajo PM2 `whatsapp-ui-baileys`.

- Pin: `baileys@7.0.0-rc14` (ESM, Node ≥ 20)
- Docs ops: [`docs/whatsapp-baileys.md`](../../docs/whatsapp-baileys.md)
- No commitear `auth/`, `.env`, ni `dist/`

```bash
cp .env.example .env   # completar; chmod 600
npm install
npm run build
npm start
```
