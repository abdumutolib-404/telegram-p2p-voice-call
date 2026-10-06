# Verification

## Check commands

Run `node scripts/check-docs.cjs` after documentation changes to check local links and reject workstation-specific file URLs.

Use installed locked dependencies. Backend helpers sanitize inherited credentials and disable external polling/crawling:

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

The CI workflow additionally runs Go race checks on Linux. Remove only the exact owned disposable containers when finished; do not remove application volumes or use global Docker cleanup.

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

Set NODE_ENV=production for frontend release builds when an inherited environment sets test mode. [verify.yml](../.github/workflows/verify.yml) defines the full CI gate, including migration/schema checks and isolated integration. Browser fixtures are available through `scripts/admin-mock-browser.cjs`; they do not authorize real admin actions.

## 2026-10-05 security remediation

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
