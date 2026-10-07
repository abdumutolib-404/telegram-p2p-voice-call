# PairTalk deployment checklist

Production uses **Cloudflare Pages + R2**, with the backend on **Fly.io OR Railway**. Use [Environment and deployment](docs/ENVIRONMENT_AND_DEPLOYMENT.md) for exact provider-to-variable mappings and per-host setup. The root environment template is for local Compose; the production backend reference is [server/.env.example](server/.env.example).

1. Run the checks in [.github/workflows/verify.yml](.github/workflows/verify.yml) and review [release follow-ups](docs/OPERATIONS.md).
2. Provision PostgreSQL, Redis, LiveKit, and a private Cloudflare R2 bucket. Copy provider values exactly into the chosen backend host's secret controls.
3. Back up the database and rehearse migrations against a restore. Drain active calls and stop older Node/Go workers before the recording lifecycle rollout.
4. Run `npm run db:deploy` from `server/` using the target database. Normal startup does not run migrations. Fly's release command is an explicit migration step.
5. Deploy Node and Go from the same revision. Publish production-built frontends with correct API origins, assets, public HTML routes, and real 404 responses.
6. Verify health, signed Telegram launches, admin OTP, socket reconnection, two-way audio, purchases/refund recovery, recording permissions, and retention deletion.
7. Monitor pending refunds, failed deletions, notifications, and post-call work. Keep the database backup and previous build available; do not drop new columns as a routine rollback.

Known limitations and historical verification are in [Operations](docs/OPERATIONS.md) and [Verification](docs/VERIFICATION.md).
