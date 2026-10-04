# Fly.io staging deployment preparation

Prepared 2026-10-04 for independent QA review. No Fly account access, resource provisioning, image upload, commit, push or deployment has been performed. This guide deploys the reviewed working tree to a new staging app, not to production DNS or production data.

## Shape and release command

`fly.staging.toml` uses the existing root Dockerfile. One application Machine runs Node on loopback port 3000 and the Go ingress on port 3001. Fly exposes only the Go ingress through HTTPS; `/healthz` checks both the gateway and its persistent dependencies. The initial size is one shared CPU with 1 GB RAM in `fra`; review that region against the chosen database/cache region and measure memory before increasing traffic.

Fly replaces Docker CMD for a release task but retains ENTRYPOINT, and sets `RELEASE_COMMAND=1`. The entrypoint now executes that task's exact arguments with `exec`, preserving its exit code, before either server starts. The configured task is `npm run db:deploy` (Prisma `migrate deploy`). A failed task blocks the release. Missing release arguments fail closed. Ordinary boot never runs migrations and retains its readiness wait, required-child monitoring and SIGTERM handling. [Fly release configuration](https://docs.fly.io/reference/configuration#run-one-off-commands-before-releasing-a-deployment)

The public HTTP service uses HTTPS enforcement, `/healthz` checks and SIGTERM with a 30-second stop allowance. VM count is a deployment choice: use `--ha=false` for the first deployment and verify one application Machine afterward. Later deploys retain existing Machine count; the TOML VM size does not cap count. A release Machine/build infrastructure and the separate stores are additional resources. [Fly deploy options](https://docs.fly.io/flyctl/cmd/fly_deploy)

## New staging app and generated URLs

Choose an unused app name such as `pairtalk-staging-<unique-suffix>` in the intended Fly organization. `pairtalk-staging-replace-me` in the config is a placeholder, not a reserved or created app. Replace it or always supply `--app`. The following are commands for QA/operator execution after account/billing access is ready; none have been run here.

```powershell
$pairtalkStagingApp = 'pairtalk-staging-<unique-suffix>'
fly apps create $pairtalkStagingApp
fly config validate --config fly.staging.toml --app $pairtalkStagingApp
# Install the new staging secrets/settings described below before deployment.
fly deploy --config fly.staging.toml --app $pairtalkStagingApp --ha=false
fly status --app $pairtalkStagingApp
fly checks list --app $pairtalkStagingApp
```

Use the generated hostname, with no custom production-domain changes:

| Purpose | Staging URL |
| --- | --- |
| Public landing | `https://<staging-app>.fly.dev/` |
| Telegram Mini App | `https://<staging-app>.fly.dev/client` |
| Administrator | `https://<staging-app>.fly.dev/admin` |
| HTTP APIs and signaling | Same origin, `/api/...`, `/socket.io/...` and `/ws` as applicable |
| Gateway readiness | `https://<staging-app>.fly.dev/healthz` |
| LiveKit Egress webhook | `https://<staging-app>.fly.dev/api/livekit/webhook` |

Set `MINI_APP_URL` and `ADMIN_PANEL_URL` to those complete path-based URLs. Set `ALLOWED_ORIGINS` to the origin only: `https://<staging-app>.fly.dev`. The shared-host routing fix keeps `/` and public guides on the landing, `/client` on the Mini App, and `/admin` on the admin SPA. Existing dedicated production-host behavior is retained. Absolute hash-named `/assets/...` requests resolve against all three built applications. The shipped frontends use same-origin APIs/socket defaults; runtime secrets do not rewrite Vite build constants. No production `.env` files enter the Docker context. Do not set production `VITE_SERVER_URL` or `VITE_API_URL` when building staging.

Configure the new staging bot's Mini App/menu URL through BotFather. Do not repoint the production bot or production LiveKit webhook. Fly sets an HTTP `X-Robots-Tag: noindex, nofollow` response header for staging; the owner's robots.txt, sitemap.xml and llms files are not rewritten.

## Separate cloud stores and new secrets

Provisioning is a later account-authorized step. Use a new PostgreSQL staging database and a separate Redis-compatible staging instance with private networking or TLS-protected external endpoints. Neither can point to a workstation, a production store, or a database/cache process inside the application VM. Choose Redis with the persistent connections, Pub/Sub and Lua/transaction behavior the app uses; an HTTP-only Redis API is not compatible. Set TLS/certificate parameters supported by both Prisma and Go/pgx for PostgreSQL and by both ioredis and Go Redis for cache. URL-encode credentials. Confirm provider idle/suspension behavior before call tests.

Supply credentials through Fly's secret controls or a private, untracked secret import, keeping values out of chat and committed files. Newly generated staging values are required:

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | New cloud staging PostgreSQL URL; release Machine and runtime must both reach it |
| `REDIS_URL` | New cloud staging Redis URL (`rediss://` when using external TLS) |
| `BOT_TOKEN` | New BotFather staging bot, separate from production |
| `JWT_SECRET` | New strong random staging signing secret |
| `MASTER_PASSWORD` | New strong staging administrator password |
| `ADMIN_TELEGRAM_IDS` | Owner-approved staging administrator identities |
| `MINI_APP_URL`, `ADMIN_PANEL_URL`, `ALLOWED_ORIGINS` | Generated staging URLs/origin from the table above |
| `LIVEKIT_HOST`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | New staging LiveKit project and credentials; WSS endpoint reachable by browsers and servers |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET` | New private staging R2 bucket endpoint, region `auto`, bucket name |
| `S3_KEY`, `S3_SECRET` | New bucket-scoped staging token with required read/write/delete permissions |
| `S3_FORCE_PATH_STYLE` | Set explicitly for the chosen S3-compatible endpoint, validated against both runtimes |
| `TRUSTED_PROXY_CIDRS` | Loopback plus verified Fly ingress peer networks, as described below |

Only non-sensitive boot settings are in TOML. No secrets or real production endpoints are provided. R2 holds durable audio; the VM's recording directory is ephemeral and must not be treated as retention storage. A private bucket and correct delete permission are required to verify signed downloads and retention deletion.

The gateway currently accepts forwarded protocol/client headers only from configured trusted peers; Node trusts the gateway's loopback hop. Do not set a universal trust range (`0.0.0.0/0` or `::/0`) to fix HTTPS redirects. Before exposing staging, confirm the actual Fly ingress peer address/network for this app and install a narrowly scoped `TRUSTED_PROXY_CIDRS` value containing loopback and that network. Fly's documented headers include the original client protocol, but the header alone does not establish a trusted peer. Test a real HTTPS request for absence of redirect loops and check that forged headers from an untrusted direct peer are rejected. The account-specific peer range is intentionally not guessed in this template. [Fly request headers](https://docs.fly.io/networking/request-headers)

Bot polling and the crawler are disabled in the template. After verifying the new bot/token, cloud stores and URLs, explicitly enable `DISABLE_BOT_POLLING=false` for this staging app. Only one deployment may poll that staging token. Leave the crawler disabled unless that external workflow is part of an authorized test. Actual Stars/recording tests need explicit staging fixtures and the appropriate Telegram test/payment configuration; no charge is authorized by creating this config.

## Billing, availability and call limits

Proxy-driven autostop/autostart is disabled to support the long-running bot, workers and signaling. This is not a way to bypass trial limits: Fly currently documents a trial allowance of two total VM hours and automatic Machine stops after five minutes. Such a trial cannot validate sustained 15-/30-minute calls or reliable polling. Account billing must permit continuous operation for those tests, and adding a payment card ends the trial and starts usage billing. No paid resources have been provisioned here. [Fly free-trial restrictions](https://docs.fly.io/about/free-trial)

One application VM is a modest staging baseline, not high availability or a throughput guarantee. Deployments/restarts can interrupt active calls. Stop starting new test calls before replacing the single Machine, and verify both parties recover. Review store, LiveKit, object-storage and Fly charges separately; no zero-cost or permanent uptime promise is made.

## Independent deployment acceptance

1. Validate TOML with the installed flyctl version, review the generated host and one-VM plan, and confirm billing supports the intended call duration.
2. Run the release migration against the new staging database. Verify a deliberate release failure aborts deployment without launching either server; do not skip the release command to hide migration failure.
3. Verify `/healthz` returns 200 only with PostgreSQL and Redis available. An intentional isolated dependency interruption must return 503 and recover when restored.
4. On the generated HTTPS host verify distinct landing, Mini App and admin shells, each shell's actual JavaScript/CSS assets, `/api` authentication, socket upgrades, no redirect loops, and staging noindex headers. Do not modify public production DNS.
5. With two owner-approved Telegram accounts verify signed launches, repeated matches/calls, two-way audio, end-call cleanup, playable recordings, recorder-only access and failed-delete retry against the new private R2 bucket.
6. Verify SIGTERM stops both services, and inspect logs without exposing secrets. Provider access, actual Fly routing/peer ranges and real external media/payment behavior remain outstanding until this account-backed test is run.

Local verification uses only disposable PostgreSQL/Redis containers on an internal Docker network and synthetic bot/LiveKit values. It does not demonstrate actual Fly deployment, real provider credentials or account billing eligibility. Run `node scripts/check-entrypoint-release.cjs pairtalk-fly-staging:local` after a local image build for the isolated release argv/exit-code checks. Normal lifecycle verification uses the existing `scripts/check-container-lifecycle.cjs` approach.
