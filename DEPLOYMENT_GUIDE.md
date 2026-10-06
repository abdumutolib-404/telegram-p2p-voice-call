# PairTalk deployment checklist

Use [Environment and deployment](docs/ENVIRONMENT_AND_DEPLOYMENT.md) for configuration and [Fly staging](docs/fly-staging.md) for the optional staging template. These describe repository workflows, not proof of a running deployment.

1. Run the checks in [.github/workflows/verify.yml](.github/workflows/verify.yml) and review [release follow-ups](docs/OPERATIONS.md).
2. Provision separate PostgreSQL, Redis, LiveKit, and private object storage. Supply secrets through the target host's secret controls.
3. Back up the database and rehearse migrations against a restore. Drain active calls and stop older Node/Go workers before the recording lifecycle rollout.
4. Run `npm run db:deploy` from `server/` using the target database. Normal startup does not run migrations. Fly's release command is an explicit migration step.
5. Deploy Node and Go from the same revision. Publish production-built frontends with correct API origins, assets, public HTML routes, and real 404 responses.
6. Verify health, signed Telegram launches, admin OTP, socket reconnection, two-way audio, purchases/refund recovery, recording permissions, and retention deletion.
7. Monitor pending refunds, failed deletions, notifications, and post-call work. Keep the database backup and previous build available; do not drop new columns as a routine rollback.

Known limitations and historical verification are in [Operations](docs/OPERATIONS.md) and [Verification](docs/VERIFICATION.md).
