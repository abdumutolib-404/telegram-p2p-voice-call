# Environment and deployment

Reviewed 2026-10-05 against repository configuration. Sample values are placeholders; existing local `.env` files must not be overwritten during maintenance.

## Requirements

- Node 24 and npm; use committed lockfiles with `npm ci`.
- Go at the version declared in [gateway/go.mod](../gateway/go.mod).
- Docker Compose for local PostgreSQL 16 and Redis 7.
- A separate LiveKit project for actual audio/recording tests.
- Private S3-compatible storage for durable cloud recordings.

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
| `LIVEKIT_HOST` | LiveKit URL; `LIVEKIT_URL` is a fallback |
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

1. Create root `.env` from [.env.example](../.env.example) if it does not exist. Set `POSTGRES_PASSWORD` for Compose, `ADMIN_MASTER_PASSWORD` for its app service, and the other required interpolation values. The service names are **db** and **redis**.
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
