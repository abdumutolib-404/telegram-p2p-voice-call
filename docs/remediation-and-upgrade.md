# Remediation and upgrade

## Scope and repository

The requested PairTalk-Production repository was inaccessible to the configured account. The user confirmed `abdumutolib-404/telegram-p2p-voice-call`, which matches the existing checkout and permits access. Work uses the feature branch `codex/backend-admin-remediation`; no history is force-pushed and no production deployment or data change is performed.

The checkout already contained a landing redesign, public statistics route/tests and a staged DIRECTORY_TREE.md. Those changes were backed up before backend work and preserved. The backend/admin PR excludes that pre-existing work, including overlapping landing-related changes in server/src/index.ts. The source ZIP includes the complete edited working source, including the preserved landing design. robots.txt, sitemap.xml, llms.txt and llms-full.txt are unchanged.

## Confirmed security and runtime failures

| Failure | Remediation |
| --- | --- |
| Persistent-storage failure could run development with mock state | Mock state is test-only; startup requires representative PostgreSQL queries and ready Redis clients |
| Startup tried destructive automatic db push and accepted data loss | Migrations are an explicit operator step; normal startup never changes schema |
| Socket adapter and Redis subscriptions could run before clients were connected | Initialize persistent clients before adapter/subscriber use; real readiness checks precede listen |
| Proxy/IP trust and origin policies were too permissive | Explicit origins, trusted-peer IP forwarding, loopback default proxy trust, CSRF protection retained |
| URL validation could be separated from the DNS address actually fetched | Pin public DNS addresses, reject mixed private answers, revalidate each redirect, preserve TLS/SNI and enforce size/time/cancellation limits |
| Refund state could precede real provider confirmation or race other administrators | Persistent reservation and row locks, provider confirmation, reconciliation, audit and newer-subscription preservation |
| Manual purchase creation, moderation, expiry and call admission could race | Shared participant/user/contest row locks, compare-and-set transitions and persistent plan configuration |
| Refund proofs were conflated with receipts or trusted by extension | Separate protected download kind, canonical base64, MIME/magic/size validation; PDF/PNG/JPEG/WebP only |
| Background notifications could disappear at restart | Persistent bounded NotificationJob queue, replica claims, queued recovery and explicit uncertain-delivery review |
| Shutdown left timers/runners or refund work active against closed storage | Stop handles, awaited active refund/notification work, stopped polling and ordered connection closure |

Existing working protections were retained, including admin/user authentication, recording owner and participant checks, signed recording access, expiry checks, cookie-authenticated mutation CSRF requirements and contest administrator authorization. Regression tests cover these behaviors; their presence was not treated as evidence of a new defect.

## Verification (2026-10-02)

| Check | Result |
| --- | --- |
| Backend/admin-only PR suite, isolated test environment | 57 files, 608 tests passed; no failures |
| Complete working source, including preserved public-statistics tests | 58 files, 612 tests passed; no failures |
| Server `npm run build` via safe-environment wrapper | Prisma client generation and TypeScript emitted build passed |
| Admin production build/type check | Passed |
| Admin lint | Passed; one existing Fast Refresh warning, no errors |
| Dedicated PostgreSQL 16 / Redis 7 integration | 13 checks passed; no failures |
| Nine admin screens × three viewport sizes | 27 results, zero page overflow and zero axe-core violations |
| Local representative backend/auth/CSRF/CORS checks | 7 passed |
| Public HTTPS representative backend/auth/CSRF/CORS checks | 7 passed |

Focused regressions cover financial ownership and races, ambiguous provider results, newer purchases, proof validation, expired/zero allowances, invitation activation, mutation retry rules, request headers/cancellation/timeout/auth, Redis NX ownership, polling tenure and DNS/redirect SSRF behavior. The server has no lint script; a server lint result is not claimed. Production deployment, live Telegram polling/OTP, real purchases/refunds, real voice calls, S3 upload and live Gemini ingestion are unrun.

## Reproduce safely

Install locked dependencies with npm ci in server and admin. The verification wrappers blank project dotenv and credential keys before module imports and use synthetic credentials.

```text
node scripts/verify.cjs unit
node scripts/verify.cjs build
node scripts/verify.cjs compile
node scripts/start-isolated-services.cjs
node scripts/isolated-command.cjs <private-runtime.json> migrate
node scripts/isolated-command.cjs <private-runtime.json> integration
node scripts/isolated-command.cjs <private-runtime.json> runtime
node scripts/check-backend.cjs <private-runtime.json>
```

The service helper creates dedicated loopback containers on 55432 and 56379, generates random bindings outside the repository and prints only their file path/container names. Do not print or commit the binding file. It is a disposable verification environment, with Redis persistence deliberately disabled; production compose enables Redis AOF persistence. On Windows, stop the isolated backend before Prisma generation to release its loaded engine DLL.

The live local verification backend binds 127.0.0.1:4182. Telegram polling and ingestion are disabled, with synthetic external-service credentials. /health queries persistent services; the functional checker separately tests real admin stats with an isolated token and rejects anonymous/admin-mismatch access, unauthorized receipt access, cookie mutations without CSRF and untrusted CORS origins. Authentication is intact.

The verified HTTPS preview is a Cloudflare Quick Tunnel. It is temporary and requires this computer, its isolated Node backend, Docker/PostgreSQL/Redis and cloudflared to remain running. It is not a production deployment. Quick Tunnel lifetime and limitations are described in [Cloudflare's documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Upgrade an existing database

1. Back up the production database and test restoration. Rehearse the upgrade on a separate restored copy. No production migration was performed by this task.
2. This repository had no tracked migration history. `202610020001_baseline` describes the original committed schema. For an **empty database**, migrate deploy applies the baseline and both additions normally.
3. For an **existing database**, compare its schema with the baseline using Prisma migrate diff. Investigate every difference and verify existing constraints and indexes. Only when the schema truly matches, record `202610020001_baseline` as applied with Prisma migrate resolve. Do not execute its CREATE TABLE statements against existing tables and do not mark an unmatched schema as applied.
4. Run `npm run db:deploy` to apply `202610020002_refund_recovery` and `202610020003_notification_jobs`. They add refund recovery columns and the notification table/index. Build with the regenerated Prisma client, then roll out the application.
5. Provide strong JWT/admin/bot/LiveKit bindings, administrator IDs, real frontend origins and the exact trusted proxy CIDRs. Set production NODE_ENV. Compose requires secrets and keeps PostgreSQL/Redis host ports on loopback. Configure a real LiveKit endpoint; the existing compose file does not supply a LiveKit service.
6. Confirm DB/Redis readiness, administrator OTP, protected receipts, a staging purchase/refund, call admission and notification recovery before production traffic. Monitor pending refunds and UNCONFIRMED jobs. Preserve database/Redis backups and avoid destroying their volumes during rollback.

Application rollback must retain additive schema changes and audit records. Do not roll back payment state or remove the new persistent recovery data blindly. No new credit model, subscription prices or production plan values were introduced.
