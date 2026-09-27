# WIS Baileys worker

Run from this directory with Node 22+, `npm ci`, then `npm test`.
Copy `.env.example` to `.env`, set the local Supabase service role key and the seeded sector slug. `npm start` starts a real WhatsApp socket only when the connection is requested in the panel. Do not run a live send test without explicit approval.

The auth directory persists across normal restarts. Store it outside Git, restrict access to the current OS user, and back it up encrypted. A second worker is rejected by the database lease. Loss of lease shuts down the socket; startup requires the WIS migration with lease RPCs. Stop with Ctrl+C; ordinary shutdown does not logout. Explicit logout invalidates and clears the session.

QR payload expires after 60 seconds. Reconnection attempts stop after five failures; operator restart/reconnect is required. Configure the full `WHATSAPP_EXPECTED_PHONE_E164` or connection expected phone after confirming the linked account. Last four digits are not an identity check. Outbound is disabled unless `WIS_OUTBOUND_ENABLED=true`, the identity matches, and the worker lease is valid. An opted-out or unknown recipient is blocked. Group outbound and campaigns remain disabled pending implementation and approval of their recipient policy.

Ambiguous wire results and interrupted sending rows become `outcome_unknown`; reconcile them before any manual retry. Message-operation ambiguity is recorded as failed with reconciliation required, never automatically retried. No external collections-policy service is contacted. Python/n8n must use the panel API and never read these credentials.

`ffmpeg-static` installation is required for audio transcoding. `npm rebuild ffmpeg-static` restores its binary if installation scripts were skipped. Tests do not open a WhatsApp socket or send messages. Real pairing, reconnect, media, and delivery verification remain operator-supervised acceptance checks.
