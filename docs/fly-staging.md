# Fly staging template

Reviewed 2026-10-05 against [fly.staging.toml](../fly.staging.toml) and [docker-entrypoint.sh](../server/docker-entrypoint.sh). This is an optional deployment template; no Fly account, resources, image upload, or deployment is established by this document.

## Repository configuration

The template uses the root Dockerfile, one shared CPU/1 GB VM in fra, public Go ingress on 3001, and Node bound to loopback on 3000. Polling/crawling begin disabled. It requests HTTPS, a /healthz check, a noindex response header, and no automatic machine stop/start.

The configured release task is `npm run db:deploy`. The entrypoint executes release arguments only when RELEASE_COMMAND=1 and propagates their exit status; ordinary boot does not migrate. For the recording lifecycle rollout, drain calls and stop old workers rather than leaving mixed Node/Go versions active through a rolling release.

These settings are starting choices, not a capacity, uptime, free-trial, or current billing guarantee. Verify current provider requirements before provisioning. Use the official [Fly documentation](https://fly.io/docs/) for account-specific operations.

## Configuration checklist

1. Replace the app-name placeholder or supply the actual staging app name. Use an isolated staging account/project and data.
2. Provision PostgreSQL, Redis with Pub/Sub/Lua support, a separate Telegram bot, LiveKit project, and private S3-compatible bucket.
3. Supply DATABASE_URL, REDIS_URL, BOT_TOKEN, admin/JWT credentials, LiveKit credentials, and storage credentials through secret controls.
4. Set MINI_APP_URL to `https://<app>.fly.dev/client`, ADMIN_PANEL_URL to `https://<app>.fly.dev/admin`, and ALLOWED_ORIGINS to the origin. Do not bake production API URLs into this staging image.
5. Verify the actual ingress peer networks before setting TRUSTED_PROXY_CIDRS; do not use universal trust ranges.
6. Confirm billing and continuous availability support the intended call duration. Do not infer current trial limits from old reports.
7. Validate the config and release task, then run the [deployment checklist](../DEPLOYMENT_GUIDE.md).

The VM recording directory is ephemeral unless separately persisted. Durable retention should use private object storage with working delete permissions. Review region/latency and memory using measured calls.

## Acceptance checks

Verify dependency readiness/failure recovery, distinct public/client/admin routes and assets, true missing-page responses, signed launches, admin OTP, both socket transports, two-way physical-device audio, permitted recordings with both voices, denied downloads, failed-delete retries, and clean shutdown. Enable polling only for the separate staging token after these dependencies are ready.

Local helpers such as `scripts/check-entrypoint-release.cjs` and container boundary/lifecycle checks use synthetic fixtures. They do not substitute for the real provider/device journey. See [Verification](VERIFICATION.md) and [Operations](OPERATIONS.md).
