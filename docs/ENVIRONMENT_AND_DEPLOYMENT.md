# Environment and deployment

Reviewed 2026-10-07 against repository configuration. Production targets are **Cloudflare Pages for the frontends, Cloudflare R2 for recordings, and Fly.io OR Railway for the combined Node/Go backend**. PostgreSQL, Redis and LiveKit remain backend dependencies. No provider credentials are bundled in the repository.

## Which environment file to use

- **`server/.env`** is the local backend configuration. Its existing values were preserved when reorganized. New blank fields still need your provider settings. Before copying configuration into your backend host's Variables/Secrets, select `NODE_ENV=production` and replace any local URLs with the actual published addresses. Do not commit or upload this file into Pages.
- [server/.env.example](../server/.env.example) is the production backend reference. Required provider fields are blank, rather than invented credentials or fake domains.
- Root [.env.example](../.env.example) is only for local Docker Compose. Its database password is a local choice, not your production database credential.
- [admin/.env.example](../admin/.env.example), [client/.env.example](../client/.env.example) and [landing/.env.example](../landing/.env.example) contain public frontend build settings.

## Copy provider values without changing them

The application controls the variable names; the provider controls the values. For example, LiveKit may label its export `LIVEKIT_URL`; put that exact value into PairTalk's `LIVEKIT_HOST`.

| PairTalk variable | Value to copy |
| --- | --- |
| `BOT_TOKEN` | BotFather's HTTP API token |
| `DATABASE_URL` | PostgreSQL provider's connection URI reachable from the backend |
| `REDIS_URL` | Redis provider's connection URI, preserving `redis://` or `rediss://` |
| `LIVEKIT_HOST` | LiveKit Project URL beginning with `wss://` |
| `LIVEKIT_API_KEY` | LiveKit API Key |
| `LIVEKIT_API_SECRET` | LiveKit API Secret |
| `S3_KEY` | Cloudflare R2 S3 **Access Key ID** |
| `S3_SECRET` | Cloudflare R2 S3 **Secret Access Key** |
| `S3_BUCKET` | Exact private R2 bucket name |
| `S3_ENDPOINT` | S3 API endpoint shown for that bucket/account, including jurisdiction if present |
| `MINI_APP_URL` | Published client Pages HTTPS URL |
| `ADMIN_PANEL_URL` | Published admin Pages HTTPS URL |

LiveKit's Project URL is a WebSocket URL; do not replace `wss://` with `https://`. See [LiveKit connection documentation](https://docs.livekit.io/intro/basics/connect/). R2 uses S3 credentials, not a general Cloudflare API token; see [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

For R2, set **`S3_REGION=auto`** and **`S3_FORCE_PATH_STYLE=true`**. The ordinary endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; copy your displayed endpoint rather than inventing an account ID. These S3 variable names are already consumed by both backend services. See [R2 S3 API configuration](https://developers.cloudflare.com/r2/api/s3/api/). Keep the bucket private. `RECORDINGS_DIR` is temporary local working space, not durable cloud storage.

`MASTER_PASSWORD` and `JWT_SECRET` are secrets you choose for PairTalk; a cloud provider does not supply them. `ADMIN_TELEGRAM_IDS` contains your administrators' numeric Telegram user IDs. `ALLOWED_ORIGINS` contains the landing, client and admin browser origins, without paths. Include custom Pages preview origins explicitly when they must read public prices from a production backend. Keep optional payment/curation fields blank until those features are configured.

The shared PostgreSQL URI must work with both Prisma and Go. Select a provider-issued PostgreSQL connection URI without Prisma-only query options such as `schema`, `pgbouncer`, `connection_limit` or `pool_timeout`; do not use an HTTP database API URL. Localhost database/Redis URLs only work when those services actually run beside the backend.

## Production: Cloudflare Pages

Create three Pages projects from the same repository. Each uses its own root directory, build command **`npm run build`**, and output directory **`dist`**. Set the Node build version to 24 to match this repository. See [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

| Project root | Public build variables |
| --- | --- |
| `landing` | `VITE_BOT_USERNAME`, `VITE_PUBLIC_STATS_URL` pointing to `/api/public/stats`, `VITE_PUBLIC_PRICING_URL` pointing to `/api/public/plans`; optional `PUBLIC_STATS_BUILD_URL` and `PUBLIC_PRICING_BUILD_URL` for dated snapshots |
| `client` | `VITE_SERVER_URL` = backend HTTPS origin; `VITE_PUBLIC_SITE_URL` = landing origin; `VITE_BASE_PATH=/` |
| `admin` | `VITE_API_URL` = backend HTTPS origin; `VITE_PUBLIC_SITE_URL` = landing origin; `VITE_BASE_PATH=/` |

Vite variables appear in browser bundles. Backend tokens, database credentials, LiveKit secrets and R2 keys belong exclusively in Fly/Railway secrets. Once Pages assigns the frontend domains, set the backend's `MINI_APP_URL`, `ADMIN_PANEL_URL`, policy URLs and `ALLOWED_ORIGINS` to their actual published addresses, then rebuild frontends whenever their public API origin changes. The admin layout is intentionally for laptops/desktops, with a minimum workspace width of 1180 CSS pixels.

The three interfaces share the same published pricing catalog. Keep the repository checkout available to frontend builds: `platform/` and `server/src/contracts/` contain their shared reader and public pricing types. See [shared pricing](PLATFORM_PRICING.md) for freshness, comparison and build snapshots.

## Production: choose Fly.io OR Railway

Both hosts use the existing root [Dockerfile](../Dockerfile) to package Go and Node together. Keep the repository root as the build context. The entrypoint runs Node privately on port 3000 and exposes Go on `PORT`; set **`HOST=127.0.0.1`** for Node. Use one backend replica initially: Telegram polling and the background crawler run inside this container. Additional replicas require a deliberate worker arrangement.

| Host | Backend settings |
| --- | --- |
| Fly.io | Use your actual production app name, `PORT=3001`, and `[http_service] internal_port=3001`; enable HTTPS. Use the root Dockerfile and supply backend settings through Fly secrets. The existing staging app name is not your production app name. |
| Railway | Build with the root Dockerfile. Let the container entrypoint start both services; leave a custom start command unset. Use Railway's supplied `PORT` and direct the public service domain to that port. Put backend settings in Variables. |

Configure the ingress readiness check at **`/healthz`**. Fly's port must match `internal_port`; Railway uses `PORT` for health probes. See [Fly app configuration](https://docs.fly.io/reference/configuration/) and [Railway health checks](https://docs.railway.com/deployments/healthchecks). Supply real proxy peer networks through `TRUSTED_PROXY_CIDRS` and verify forwarded HTTPS/client-IP handling. The loopback default is not a complete cloud proxy configuration.

Migrate before starting the new revision, using the built container in release mode: `RELEASE_COMMAND=1` with `npm run db:deploy` from `/app/server`. On Fly this can be an explicit release command; on Railway it can be a pre-deploy command with release mode enabled only for that command. Do not set `RELEASE_COMMAND=1` globally on the running web service. Normal container startup does not run migrations. The rollout precautions below still apply.

## Requirements

- Node 24 and npm; use committed lockfiles with `npm ci`.
- Go at the version declared in [gateway/go.mod](../gateway/go.mod).
- Docker Compose for local PostgreSQL 16 and Redis 7.
- A separate LiveKit project for actual audio/recording tests.
- Private Cloudflare R2 storage for durable production recordings.

There is no root npm package. Install `server`, `client`, `admin`, and `landing` separately.

## Configuration sources

Node loads `.env` from its working directory. Go loads its own `.env` and then `../server/.env`; process environment values take precedence. Root `.env` is used by Compose and is not automatically the Node application's environment.

| Setting | Meaning |
| --- | --- |
| `PORT` | Go public port, default 3001. Set Node to 3000 when running both locally. |
| `NODE_URL` | Go's Node upstream; default `http://127.0.0.1:3000` |
| `HOST` | Optional Node bind address; defaults to `0.0.0.0` |
| `NODE_ENV` | development, test, or production; test uses explicit mocks |
| `DATABASE_URL`, `REDIS_URL` | Required real persistence outside test mode; schema is PostgreSQL |
| `BOT_TOKEN` | Main Telegram bot; separate test bot for staging |
| `PAYMENTS_BOT_TOKEN` | Optional payment bot |
| `MASTER_PASSWORD` | Node admin password; `ADMIN_MASTER_PASSWORD` is accepted as a fallback alias |
| `ADMIN_TELEGRAM_IDS`, `JWT_SECRET` | Authorized admins and signing secret |
| `LIVEKIT_HOST` | LiveKit Project WebSocket URL (`wss://`); `LIVEKIT_URL` is a fallback |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Credentials for server operations and webhook verification |
| `MINI_APP_URL`, `ADMIN_PANEL_URL` | Complete public app/admin URLs |
| `ALLOWED_ORIGINS` | Allowed browser origins |
| `TRUSTED_PROXY_CIDRS` | Trusted immediate proxy peers; default loopback |
| `RECORDINGS_DIR` | Local recording path; must be persistent/shared when used for delivery |
| `S3_KEY`, `S3_SECRET`, `S3_BUCKET` | S3-compatible recording credentials and private bucket |
| `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | Provider-specific object-storage configuration |
| `DISABLE_BOT_POLLING`, `DISABLE_BACKGROUND_CRAWLER` | Set to `true` for isolated checks without external polling/crawling |
| `PRIVACY_POLICY_URL`, `COMMUNITY_GUIDELINES_URL` | Public policy links used by the bot |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional crawler curation settings |
| `MANUAL_PAYMENT_*` | Regional payment support/requisites; see the server template |

Full parsing and validation live in [Node env](../server/src/config/env.ts) and [Go env](../gateway/internal/config/env.go). Production rejects missing/insecure required credentials and unavailable persistence. Do not use SQLite merely because an old fallback URL mentions a local file.

## Local persistence and application setup

1. Create root `.env` from [.env.example](../.env.example) if it does not exist. Set `POSTGRES_PASSWORD`, `ADMIN_MASTER_PASSWORD`, and the other required interpolation values. Compose validates the full configuration even when selecting only the database/cache services. The service names are **db** and **redis**.
2. Start only local persistence:

```text
docker compose up -d db redis
docker compose ps
```

Compose exposes PostgreSQL and Redis on loopback ports 5432 and 6379. The database name is `ielts_p2p`, user `postgres`; set the matching password in the application's DATABASE_URL. URL-encode special characters in credentials.

3. Create `server/.env` from [server/.env.example](../server/.env.example) if absent. Set development mode and explicit local URLs. In particular, use the Compose database name/password rather than the template's example URL. Disable bot polling/crawling until separate test credentials are configured.
4. Install dependencies and migrate:

```text
npm ci --prefix server
npm ci --prefix client
npm ci --prefix admin
npm ci --prefix landing
npm run db:deploy --prefix server
npm run db:generate --prefix server
```

Use migrations for an empty local database. Do not use `db push --accept-data-loss` or automatically baseline a populated database.

5. Run Node and Go in separate terminals, with their working directories and ports explicit. PowerShell:

```powershell
# Terminal 1, from server/
$env:PORT = '3000'
npm run dev

# Terminal 2, from gateway/
$env:PORT = '3001'
$env:NODE_URL = 'http://127.0.0.1:3000'
go run ./cmd/gateway
```

For browser development, use separate terminals:

```text
npm run dev --prefix client -- --port 5173
npm run dev --prefix admin -- --port 5174
npm run dev --prefix landing -- --port 5175
```

The ports are explicit choices; admin Vite does not automatically default to 5174. Client `VITE_SERVER_URL` and admin `VITE_API_URL` (or `VITE_SERVER_URL`) must point to the local gateway when frontend origins differ. Allow those origins in backend configuration. Real Mini App launches and microphone access need the appropriate HTTPS Telegram setup; an ordinary browser does not provide signed Telegram identity.

## Frontend build configuration

Vite variables are public build-time values. Never put tokens or passwords in them.

| Package | Settings |
| --- | --- |
| Client | `VITE_SERVER_URL`, optional `VITE_BASE_PATH` |
| Admin | `VITE_API_URL` or `VITE_SERVER_URL`, optional `VITE_BASE_PATH` |
| Landing | `VITE_BOT_USERNAME`, `VITE_PUBLIC_STATS_URL`; optional non-VITE `PUBLIC_STATS_BUILD_URL` for a dated build snapshot |

Use production mode when creating release bundles. Landing builds pre-render public HTML and a 404 page. Serve generated extensionless pages and a true HTTP 404 for unknown routes; do not blanket-rewrite all public URLs to the homepage.

## Production rollout

[Dockerfile](../Dockerfile) builds all packages and packages Go and Node together. [docker-entrypoint.sh](../server/docker-entrypoint.sh) starts the required processes, checks readiness, and stops both if one exits. It **does not migrate on normal startup**. Apply migrations explicitly with `npm run db:deploy`; the optional Fly release invocation is separate.

For `202610050001_recording_lifecycle`, drain active calls, stop older workers, apply the additive migration, and deploy Node/Go from the same revision. Old code may erase saved owners or mistake retained egress metadata for active intent. Known URLs are backfilled; already-lost keys/owners cannot be reconstructed.

Expose only the intended gateway ingress. Configure proxy trust using actual peer networks and verify forwarded protocol/IP handling. Do not use a universal trust range to hide redirect errors. Cloud local-disk recordings disappear on ephemeral hosts unless durable storage is configured.

See [deployment checklist](../DEPLOYMENT_GUIDE.md), [Fly staging](fly-staging.md), and [Operations](OPERATIONS.md). No provider account, DNS setting, secret, or deployment is changed by this guide.
