# Environment and deployment

Reviewed 2026-10-07. Production uses Cloudflare Workers for the three frontends, Cloudflare R2 for recordings, and Fly.io OR Railway for the combined Node/Go backend. PostgreSQL, Redis and LiveKit remain backend dependencies.

## Environment files

Each application has its own template: [server/.env.example](../server/.env.example), [client/.env.example](../client/.env.example), [admin/.env.example](../admin/.env.example), and [landing/.env.example](../landing/.env.example). Copy a template only if its local .env is absent. Preserve existing provider values. Configure backend secrets in the host's secret controls and public frontend variables in Cloudflare build settings.

There is no root environment template or root npm package. Install each package separately using Node 24 and npm ci. The optional local Compose password is documented in server/.env.example.

## Provider values

The application controls variable names; providers supply values. Copy values exactly, including protocols. Never put backend secrets into VITE variables: these appear in browser bundles.

| Variable | Value to copy |
| --- | --- |
| BOT_TOKEN | BotFather HTTP API token |
| DATABASE_URL | PostgreSQL connection URI reachable from both Node and Go; omit Prisma-only parameters |
| REDIS_URL | Redis connection URI, preserving redis:// or rediss:// |
| LIVEKIT_HOST | LiveKit Project URL including wss://; if exported as LIVEKIT_URL, copy its value here |
| LIVEKIT_API_KEY, LIVEKIT_API_SECRET | LiveKit project credentials |
| S3_KEY, S3_SECRET | R2 S3 Access Key ID and Secret Access Key, not a general Cloudflare API token |
| S3_BUCKET, S3_ENDPOINT | Exact private bucket name and displayed S3 endpoint, including jurisdiction |
| MINI_APP_URL, ADMIN_PANEL_URL | Published client and admin HTTPS URLs |

Use S3_REGION=auto and S3_FORCE_PATH_STYLE=true for R2. Keep the bucket private. RECORDINGS_DIR is temporary working space; durable recordings belong in R2. See [LiveKit connection](https://docs.livekit.io/intro/basics/connect/), [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/), and [R2 S3 settings](https://developers.cloudflare.com/r2/api/s3/api/).

MASTER_PASSWORD and JWT_SECRET are application secrets you choose. ADMIN_TELEGRAM_IDS contains authorized numeric Telegram IDs. ALLOWED_ORIGINS contains the actual landing, client and admin browser origins without paths. Set policy URLs to published HTTPS pages. Leave optional payment and curation integrations blank unless used. Validation lives in [Node configuration](../server/src/config/env.ts) and [Go configuration](../gateway/internal/config/env.go).

## Production: Cloudflare Workers

Each frontend deploys independently as a static-asset Worker. Names match the existing Cloudflare projects.

| Application | Worker name | Build root | Configuration | Public build settings |
| --- | --- | --- | --- | --- |
| Admin | admin-pairtalk-dev | admin | [wrangler.jsonc](../admin/wrangler.jsonc) | VITE_API_URL, VITE_PUBLIC_SITE_URL |
| Client | app-pairtalk-dev | client | [wrangler.jsonc](../client/wrangler.jsonc) | VITE_SERVER_URL, VITE_PUBLIC_SITE_URL, VITE_BOT_USERNAME |
| Landing | telegram-p2p-voice-call | landing | [wrangler.jsonc](../landing/wrangler.jsonc) | VITE_BOT_USERNAME, VITE_PUBLIC_STATS_URL, VITE_PUBLIC_PRICING_URL |

For each Worker, select production branch **main**, build command **npm run build**, and deployment command **npm run deploy**. Set **NODE_VERSION=24** and supply public variables from that application's template. Non-production branches use **npm run deploy:preview**. The root directory is the frontend folder; keep the full repository checkout available for shared platform code. No JavaScript Worker entrypoint is needed; never pass index.html as a Worker script.

Wrangler is pinned in each lockfile. From an application folder:

~~~text
npm ci
npm run build
npm run deploy:check
~~~

The last command is a dry run. Use npm run deploy to publish with your authenticated Cloudflare account, or npm run dev:worker to preview routing locally after building. Build settings are separate from runtime variables. See [Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

Client and admin use SPA routing. Landing serves pre-rendered public pages and a true HTTP 404 for unknown routes. The owner's robots.txt, sitemap.xml and llms files are copied unchanged. Admin remains a laptop/desktop interface; client and landing remain responsive. Set backend ALLOWED_ORIGINS to actual frontend domains. Rebuild after changing API addresses. See [shared pricing](PLATFORM_PRICING.md).

### Deleted or rotated build token

The supplied October 7 logs stopped before compilation because the selected build token was deleted or rolled. In each Worker, open **Settings → Build → Build configuration → API token**, select a valid token or create a replacement, save, and retry. A revoked token can remain visible in the dropdown. Repository files cannot restore a deleted account credential. Never put this token in a VITE variable or commit it. See [Cloudflare troubleshooting](https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/).

## Production: choose Fly.io OR Railway

[server/Dockerfile](../server/Dockerfile) packages Go and Node together. **The service root and Docker build context must be the repository root (/), even though the Dockerfile lives in server/.** A server-only context cannot resolve COPY server/... or COPY gateway/.... Frontends deploy independently to Workers and are excluded from this image.

The entrypoint starts Node privately on port 3000 and exposes Go on PORT. HOST=127.0.0.1 keeps Node private. Use one backend replica because Telegram polling and the crawler run in this container. Configure TRUSTED_PROXY_CIDRS from actual immediate proxy peer networks and verify forwarded HTTPS/client-IP handling; the loopback default does not establish cloud ingress trust.

The default runner excludes development dependencies and keeps the Prisma migration CLI. For the existing isolated container/socket verification helpers only, build the backend-verification target with docker build --target backend-verification -f server/Dockerfile -t pairtalk-whole-audit:local . from the repository root. That disposable target retains probe dependencies; never publish it as the production image. Frontend routing is checked separately through Wrangler.

### Railway

For the existing backend service, set **Root Directory to / (repository root)** and clear any server-only setting. Use **server/Dockerfile**, leave the custom Start Command empty, set the Pre-Deploy Command to **npm run db:deploy**, and set the Healthcheck Path to **/healthz**. Railway supplies PORT; point the public domain at that gateway port. Supply backend secrets through service Variables. The internal Node port is 3000 and must not be the public target.

[server/railway.ts](../server/railway.ts) is the Railway Infrastructure as Code file. Railway's current documentation deprecates railway.json/railway.toml for new services, so this repository uses the current TypeScript format. It declares only the backend service, with a repository-root GitHub source and backend Dockerfile; it does not create replacement databases or buckets. See [Railway IaC](https://docs.railway.com/infrastructure-as-code) and [Dockerfiles](https://docs.railway.com/builds/dockerfiles).

Install Railway CLI 5.42.1 or newer, authenticate and link the intended existing project/environment. Install the backend's locked dependencies with npm ci --prefix server. Set the local CLI variable PAIRTALK_RAILWAY_SERVICE_NAME to the exact existing service name before using the file; this is an identifier, not a credential. Run **railway config plan --file server/railway.ts** from the repository root and review that it targets the intended service. Then apply with **railway config apply --file server/railway.ts**. A file committed to Git does not itself change the existing service's dashboard root directory. If the service is managed by a legacy configuration, follow Railway's migration flow before applying IaC. Keep the existing provider Variables intact. For dashboard-only setup, set RAILWAY_DOCKERFILE_PATH=server/Dockerfile in service Variables.

Single-replica configuration still permits an old/new deployment transition. Drain active calls and stop the older polling bot before coordinated backend rollouts; zero overlap after health checks alone does not prevent concurrent startup. R2 holds durable recordings, so no local storage volume is provisioned.

#### Database startup failures

The backend checks both the PostgreSQL connection and required tables before becoming ready. The log heading identifies the failing stage (configuration, connection, or schema) and includes a Prisma error code when available. A connected database service alone does not establish that the backend has the right URL or that migrations succeeded.

For Railway-hosted PostgreSQL, add a reference variable on the **backend service**: DATABASE_URL=${{Postgres.DATABASE_URL}}, replacing Postgres with the actual database service name. Keep both services in the same project and environment for private networking. Local server/.env is intentionally excluded from the Docker image and does not configure Railway Variables. For an external database, use its provider connection URI and required TLS settings. See [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) and [reference variables](https://docs.railway.com/variables).

P1000 indicates authentication failure; P1001 indicates an unreachable database; P1011 indicates a TLS failure. P2021/P2022 indicate a missing table/column: inspect the **npm run db:deploy pre-deploy logs**, confirm migrations ran against this same database, and resolve any migration error before redeploying. Expand error.message for unknown failures. Never reset or automatically baseline a populated production database to bypass startup. See [Prisma error reference](https://docs.prisma.io/docs/orm/reference/error-reference).

### Fly.io

Use [server/fly.toml](../server/fly.toml). Replace its example app name with your actual Fly app or pass --app. Store backend credentials in Fly secrets, not build arguments. Run from the repository root:

~~~text
fly deploy --config server/fly.toml --app YOUR_ACTUAL_FLY_APP --ha=false
~~~

Keep one Machine, PORT=3001, and internal_port=3001. The template disables automatic stopping and uses an immediate rollout to avoid overlapping polling bots; expect brief downtime. Its explicit release command applies migrations before startup. Do not set RELEASE_COMMAND=1 globally. See [Fly configuration](https://docs.fly.io/reference/configuration/).

## Local setup

Use Node 24, the Go version in [gateway/go.mod](../gateway/go.mod), and Docker Compose for PostgreSQL 16 and Redis 7.

1. Create server/.env only if absent. For optional local persistence, set POSTGRES_PASSWORD and start db and redis:

~~~text
docker compose --env-file server/.env up -d db redis
docker compose --env-file server/.env ps
~~~

These services publish only loopback ports 5432 and 6379. The local database name is ielts_p2p, user postgres; configure the matching DATABASE_URL explicitly. URL-encode special characters in credentials. Do not overwrite production provider values with local ones.

2. Install dependencies and apply migrations to the intended local database:

~~~text
npm ci --prefix server
npm ci --prefix client
npm ci --prefix admin
npm ci --prefix landing
npm run db:deploy --prefix server
~~~

Use development mode and disable polling/crawling until separate test credentials exist. Node loads .env from its working directory; Go also reads ../server/.env. Process environment values take precedence. Run from separate PowerShell terminals:

~~~powershell
# From server/
$env:PORT = '3000'
npm run dev

# From gateway/, in another terminal
$env:PORT = '3001'
$env:NODE_URL = 'http://127.0.0.1:3000'
go run ./cmd/gateway
~~~

Run frontend development servers separately with npm run dev --prefix client (or admin/landing), choosing explicit ports when needed. Client VITE_SERVER_URL and admin VITE_API_URL must point to the gateway. Allow these origins in the backend. Real Mini App launches and microphone access require HTTPS and signed Telegram identity.

## Production rollout

1. Run [.github/workflows/verify.yml](../.github/workflows/verify.yml) and review [Operations](OPERATIONS.md).
2. Back up the database and rehearse migrations against a restore. Drain active calls and stop older Node/Go workers for recording lifecycle changes.
3. Apply migrations explicitly through the release/pre-deploy command. Normal [container startup](../server/docker-entrypoint.sh) does not migrate. Never automatically baseline a populated database or accept data loss.
4. Deploy Node and Go from the same revision and rebuild frontends with correct API origins.
5. Verify signed Telegram launches, PDF consent, admin OTP, sockets/reconnection, two-way audio, purchases/refunds, recording delivery and retention deletion.
6. Monitor failures and retain the backup and previous image. Dropping new columns is not a routine rollback.

For 202610050001_recording_lifecycle, older workers may erase saved owners or mistake retained egress metadata for active intent. Known URLs are backfilled; already-lost keys and owners cannot be reconstructed. Keep R2 configured because cloud local disks are ephemeral. Historical checks and limitations remain in [Verification](VERIFICATION.md) and [Operations](OPERATIONS.md).
