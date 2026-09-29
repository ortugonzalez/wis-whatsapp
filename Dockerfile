FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PORT=3010 \
    WIS_LOCAL_PORT=3010 \
    WIS_LOCAL_HOST=0.0.0.0 \
    WIS_WORKER_DISABLED=true \
    WIS_TRUST_PROXY=true \
    WIS_OUTBOUND_ENABLED=false \
    WIS_WEBHOOKS_ENABLED=false

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .

VOLUME ["/app/.local"]
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3010/api/local-status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "local/start.mjs"]
