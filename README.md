# PairTalk

PairTalk connects English learners for speaking practice through a Telegram Mini App. This repository contains the public website, call client, operations console, Telegram bot, HTTP API, and voice gateway.

## Repository layout

| Directory | Responsibility |
| --- | --- |
| `landing/` | Public React website, pre-rendered guides, pricing, and aggregate statistics |
| `client/` | Telegram Mini App, matchmaking, LiveKit audio, and call controls |
| `admin/` | Authenticated operations console |
| `server/` | Node/TypeScript API, grammY bots, Prisma schema/migrations, payments, and workers |
| `gateway/` | Go ingress, signaling, admission, and LiveKit lifecycle |
| `scripts/` | Reusable isolated verification, browser fixtures, and packaging |
| `test/` | Protocol/API/workflow integration harness |
| `docs/` | Developer and product documentation |

The production Docker image starts Node internally on port 3000 and the Go gateway on `PORT` (3001 by default). The gateway proxies HTTP to Node and owns public signaling. PostgreSQL and Redis are required persistence services; LiveKit carries audio. Private S3-compatible storage supports durable cloud recordings.

## Start here

- [Environment and local setup](docs/ENVIRONMENT_AND_DEPLOYMENT.md)
- [Deployment checklist](DEPLOYMENT_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Shared pricing and comparison](docs/PLATFORM_PRICING.md)
- [Documentation index](docs/README.md)
- [Operations and release follow-ups](docs/OPERATIONS.md)
- [Dated verification record](docs/VERIFICATION.md)

Use Node 24, npm with the committed lockfiles, and the Go version declared in `gateway/go.mod`. Install each package with `npm ci`; there is no root npm package. Docker Compose provides services named `db` and `redis`. Sample environment files are templates and need explicit database URLs and matching passwords.

## Verification

[.github/workflows/verify.yml](.github/workflows/verify.yml) is the maintained check list. After installing dependencies and generating Prisma, fast backend checks are:

```text
node scripts/verify.cjs build
node scripts/verify.cjs unit --maxWorkers=2 --minWorkers=1
```

These helpers use a restricted synthetic environment. See [verification instructions](docs/VERIFICATION.md) for persistence and frontend checks.

## Release boundaries

The 2026-10-05 recording lifecycle migration requires a coordinated Node/Go rollout after active calls drain. Local checks pass; real Telegram transactions, two-device audio, and cloud recording retention still need staging validation. Previously lost recording references need separate reconciliation. Credentials reported exposed in the 2026-10-04 review still require owner-confirmed rotation.

The application currently uses configurable Free/Plus/Pro/Boss subscriptions. Independent non-expiring credits and optional storage are planned, not implemented. Documentation cleanup does not change prices, balances, public policy pages, or crawler files.
# Bot and dashboard responsibilities

Registration, PDF terms acceptance and payments stay in Telegram. Calls, recordings, feedback and account preferences are in the private dashboard. See [the bot and dashboard guide](docs/BOT_AND_DASHBOARD.md) for consent versioning, access checks and the required database migration.
