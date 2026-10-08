# Verification

## Check commands

Run `node scripts/check-docs.cjs` after documentation changes to check local links and reject workstation-specific file URLs.

Use installed locked dependencies. Backend helpers sanitize inherited credentials and disable external polling/crawling:

The obsolete top-level `test/` harness has been retired. Its bot, database and socket implementations were standalone mocks that duplicated old product rules; those suites did not exercise the application. Use the production-module server/client tests, real PostgreSQL gateway checks, production Lua tests, and isolated container transport checks below. Passing mock tests does not certify live provider behavior.

```text
node scripts/verify.cjs build
node scripts/verify.cjs unit --maxWorkers=2 --minWorkers=1
```

For dedicated local persistence, `node scripts/start-isolated-services.cjs` creates PostgreSQL/Redis on loopback 55432/56379 and prints the private runtime-file directory and owned container names. Keep that file outside the checkout; do not print its contents. Do not start duplicate services if those ports belong to an existing run.

```text
node scripts/isolated-command.cjs <private-runtime.json> migrate
node scripts/isolated-command.cjs <private-runtime.json> schema
node scripts/isolated-command.cjs <private-runtime.json> integration
node scripts/gateway-check.cjs <private-runtime.json> test ./... -count=1
node scripts/gateway-check.cjs <private-runtime.json> vet ./...
```

For Go race checks, run the gateway test command with -race in a supported Linux environment. Remove only the exact owned disposable containers when finished; do not remove application volumes or use global Docker cleanup.

Frontend checks:

```text
npm test --prefix client
npm run lint --prefix client
npm run build --prefix client
npm run lint --prefix admin
npm run build --prefix admin
npm run build --prefix landing
npm run check --prefix landing
```

Set NODE_ENV=production for frontend release builds when an inherited environment sets test mode. The owner removed the GitHub verification workflow on October 7; these commands remain the manual verification checklist, including migration/schema checks and isolated integration. Run each frontend's deploy:check script for a Workers dry run. Browser fixtures are available through `scripts/admin-mock-browser.cjs`; they do not authorize real admin actions.

## 2026-10-08 engineering remediation

The 45 observations in the retained engineering review and four associated security findings have implementation changes in the working tree. The issue-by-issue remediation receipt is retained through Codex Security outside the checkout. This is local verification, not a production deployment or a claim that all devices/providers have been exercised.

- Backend: 84 files / 839 tests passed; later focused policy, pricing, championship and crawler regressions passed after final corrections. Backend types and the Node/Go container build passed.
- Client: 10 files / 60 tests passed; the final privacy-copy change also passed its focused tests and production rebuild. Admin types/build and landing SSR/prerender/content checks passed.
- Persistence: 35 checks passed using dedicated PostgreSQL/Redis services, including actual recording-credit preservation and Redis-driven terminal room cleanup. All eight Go packages and Go vet passed with isolated database bindings; the two-gateway check passed again with terminal relay/reconnect controls. A separate Linux race-detector run passed all eight packages; database-bound tests in that run require separate bindings and were covered by the earlier persistence run.
- Deployment: actual container HTTP/socket checks passed for signed Telegram launches over WebSocket and polling, moderation rejection, recording webhook races, server audit pagination, ended-contest protection, configurable plan assignment and durable crawler job admission. Redis interruption returned degraded readiness, recovery restored readiness, and SIGTERM drained both services.
- Schema: all migrations applied from a fresh dedicated schema; Prisma reported no drift. The three-page revised PDF was rendered and visually checked. Local documentation links passed.

The actual PostgreSQL admin checks additionally caught advisory-lock queries returning PostgreSQL's void type to Prisma; the contest, crawler admission and shared pricing queries now cast that result to text. The container checks exercise this production-only path, which mock-only tests had missed.

Before rollout, drain old call-serving processes, apply `202610080001_recording_consumption` and `202610080002_background_crawl` with `prisma migrate deploy`, then deploy the matching Node/Go backend and client/admin together. The consent document version is now 2026-10-08; previous accepted artifacts remain archived. Old subscription records have a 30-day compatibility backfill because their original duration was not stored. Previously overwritten recording segments cannot be reconstructed. Real Telegram audio/refund, LiveKit reconnect/egress and R2 provider journeys remain staging smoke checks. Do not deploy the Docker `backend-verification` target; deploy the default runner.

## 2026-10-05 security remediation results

Verified before this documentation cleanup in a disposable checkout with synthetic credentials:

| Check | Result |
| --- | --- |
| Original-code regression baseline | 12 expected failures, 35 passing controls |
| Final Node suite | 71 files, 742 tests passed |
| Final Go suite | All eight packages passed, including PostgreSQL checks |
| Actual PostgreSQL/Redis/CLI checks | Completion races, recording ownership/history cleanup, OTP replay, stale payment settlement, valid expired-tier purchase, safe CSV export passed |
| Migration compatibility | Pre-migration private/shared recording fixtures, known keys, and historical purchases passed |
| Backend types and production build | Passed |
| Admin production build | Passed |

Fix evidence is retained by Codex Security outside the checkout. This table does not claim a new scan or fresh execution during documentation cleanup. Real Telegram refunds, LiveKit cluster operations, and S3 deletions used controlled provider substitutes; production smoke checks remain necessary. Dedicated security-test containers were removed after testing.

## Historical application/browser evidence

[verification/application-audit.json](verification/application-audit.json), [verification/admin-browser.json](verification/admin-browser.json), [verification/miniapp-launch.json](verification/miniapp-launch.json), and [verification/production-readiness-20261004.json](verification/production-readiness-20261004.json) are older dated records. They cover prior local checks, synthetic browser workflows, viewport results, and the historical release-blocked decision. Their counts and source state do not supersede the newer security verification or establish a production release.

One-off QA scripts, transient logs, source archives, and overlapping narrative reports were removed from the checkout. Older full details remain in Git history. [Operations](OPERATIONS.md) retains unresolved release requirements, including provider staging and credential rotation.

## 2026-10-06 security remediation verification

The nine findings from Codex Security scan `77821191-3cad-42cd-8995-64461c686879` were remediated in the working tree. Focused checks cover every finding: bounded Socket.IO GET and POST polling, recording-state privacy and cross-replica notification behavior, canonical IELTS filters and bounded exports, safe crawler response handling, per-room recording keys, durable media authorization and call accounting, refund ownership, and truthful privacy copy.

The strongest completed checks used a disposable PostgreSQL 16 and Redis 7 pair on loopback: the Node integration harness passed 32 checks, the Go gateway packages passed with `-race` in the Linux verification container, Go `vet` passed, and the TypeScript backend typecheck, changed client recording/privacy tests, client lint, and production build passed. A full Node suite run reached 773 passing tests with one stale cache expectation, which was corrected; later whole-suite retries were affected by local worker/ephemeral-port exhaustion and are recorded as environment-limited rather than silently treated as passes.

The media authorization migration must be deployed after draining old Node and Go call-serving processes, then both new implementations must be deployed together. The migration backfills currently ACTIVE sessions as already authorized to preserve existing calls. Production Telegram, LiveKit, and object-storage provider behavior remains to be exercised in staging with rotated credentials before release.
