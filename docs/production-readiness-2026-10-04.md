# PairTalk production readiness — 4 October 2026

## Result

**NOT READY FOR USERS.** The local release candidate passes the checks described below, including independent verification of two P1 fixes. Cloud deployment, real Telegram calls, playable LiveKit recordings, and direct R2 operations remain unverified. Hosting and account access currently prevent those tests. A credential exposure incident also requires user rotation before release.

This is a checkpoint at a genuine external blocker. The production-readiness goal remains incomplete.

The same hosting/account access blocker has persisted through three consecutive goal turns. The final audit again directly confirmed Railway's expired trial with 0 of 3 services online and the LiveKit account email mismatch. Both public backend health paths still return 404. No live deployment job or test runtime remains to wait for, and the reviewed source hashes are unchanged. The audit meets the threshold for marking the goal blocked pending owner action; it does not meet the completion criteria. Evidence: `artifacts/qa-20261004/blocker-recheck-3.json`.

## Deployment and architecture

The application uses a Go gateway for public ingress, Socket.IO polling/WebSocket signaling, matchmaking and LiveKit integration; a Node Express/grammY backend for the Telegram bot, administration, call completion, durable notifications and recording cleanup; PostgreSQL through Prisma/pgx; Redis; and React frontends for the landing page, Mini App and administration. LiveKit Cloud provides media/egress and Cloudflare R2 supplies private recording storage. The intended cloud stack uses Railway for backend/database/cache and Cloudflare for frontend delivery and access protection.

No cloud deployment was created or updated during this checkpoint. The authenticated Railway dashboard for `generous-reprieve` reported an expired trial and **0 of 3 services online**: PairTalk-Production, PostgreSQL and Redis. The database had no active deployment. Restoring paid hosting requires the account owner's billing action.

External HTTPS observations:

| Address | Observed response | What it establishes |
| --- | --- | --- |
| https://pairtalk.online/ | 200, Cloudflare HTML | Public landing is reachable |
| https://app.pairtalk.online/ | 200, Cloudflare HTML | Mini App shell is reachable |
| https://admin.pairtalk.online/ | 302 to Cloudflare Access | Access protection redirects anonymous visitors |
| https://api.pairtalk.online/health | 404, Cloudflare JSON | This path did not establish backend readiness |
| https://api.pairtalk.online/healthz | 404, Cloudflare JSON | This path did not establish backend readiness |

The public pages do not establish that calls or the bot work. Evidence: `artifacts/qa-20261004/public-endpoints.json`.

Temporary local tests used new isolated PostgreSQL and Redis containers on loopback only. The production image ran on an internal Docker network with external networking disabled, a read-only filesystem and temporary recording storage. All test containers and test networks have been removed. No application server or public tunnel remains running from this workstation.

## Tests performed

| Area | Final result | Scope and limits |
| --- | --- | --- |
| Backend regression | 69 files, 718 tests passed | Actual project test suite; includes synthetic provider failures |
| Mini App regression | 6 files, 32 tests passed | One-worker retry passed after the initial parallel run had worker startup timeouts |
| Go gateway | All 8 packages passed; static checks passed | Windows run included dedicated PostgreSQL integration tests |
| Linux gateway race checks | All 8 packages passed with race detection; static checks passed | Docker gateway-verification target; PostgreSQL-dependent tests lacked bindings in this separate run |
| Database and Redis integration | 31 checks passed twice | Transactions, admission locks, quotas, completion rollback, recovery, moderation, referrals and durable notifications |
| Database migrations | All 4 migrations applied; schema comparison matched | Newly created isolated database, no production data |
| Production image functional checks | 24 checks passed on final image | Readiness, admin authorization, CSRF, CORS, signed Telegram authentication, both signaling transports, routing and signed webhook races |
| Production image recording access | 10 checks passed | Actual gateway/backend/PostgreSQL and signed authentication; local synthetic file bytes, not a real audio recording |
| Production lifecycle | 3 checks passed twice | Redis interruption returns sanitized 503, reconnection restores readiness, SIGTERM drains both processes with exit 0 |
| Production builds | Server, client, admin and landing passed | Final Docker image also built successfully |
| Landing validation | All 11 pages passed | Metadata, links, crawler assets, theme control and initial JavaScript budget; 77.1 KiB gzip |
| Dependency audits | Zero known production dependency vulnerabilities in all 4 Node packages | Audit result at testing time; does not prove general security |
| Secret pattern scan | 421 text files and 175 reachable commits examined | No committed environment files; only the reviewed fake private-key-header fixture matched |
| Git whitespace check | Passed | Existing unrelated changes preserved |

The final isolated production runtime log review found zero structured error entries. Twenty-five warnings corresponded to deliberately invalid authentication/webhooks and crawler network requests blocked by the isolated network. Unit/integration test logs also contain deliberately injected failure logs; these were not treated as production failures.

The current retention tiers remain Free 1 day, Plus 7 days, Pro 30 days and Boss 90 days. Failed-delete retry behavior and local-file cleanup were tested with safe fixtures. **Actual expired-object deletion in R2 has not been verified.**

Evidence is retained under `artifacts/qa-20261004/`, with final backend and client suite logs at `artifacts/qa-20261004-backend-final.log` and `artifacts/qa-20261004-client-retry.log`. Reviewed source hashes are in `reviewed-source-hashes.json`.

## Issues discovered and independently verified fixes

### P1 — Failed storage deletion reported as a successful purge

The S3 deletion helper logged an exception and returned successfully. Retention cleanup therefore cleared recording metadata and counted the object as purged while the object could still exist, losing the reference needed for retry.

Development changed the helper to propagate the failure. Cleanup now preserves the reference and permits retry while continuing to later sessions. Independent reproduction against actual source changed from one metadata write and a false successful purge to zero metadata writes and zero purges after a failed delete. Retry and idempotence passed. Nine regression cases cover denial/timeouts, subsequent sessions, metadata failures and local-file behavior. Evidence: `retention-failure-result.json` and `server/src/__tests__/storage_retention.test.ts`.

### P1 — HTTP retrieval bypassed the recorder ownership rule

For a recording owned by participant A, the bot rejected participant B, but the HTTP recording route accepted B on participant membership and entitlement alone. The independent reproduction returned 200 and a recording URL to B.

Development added a shared exact-ID recording access helper and enforced it before entitlement checks and file/URL retrieval on both recording route aliases. The bot now uses the same helper. Independent reproduction returns owner 200, non-recorder participant 403 without a URL, and outsider 403. Forty-nine regression cases use signed authentication and cover JSON, redirects, local streams, exact IDs, shared recorder markers, forged/expired authentication and expiry. Ten additional checks passed against the rebuilt production image.

Legacy null/empty recorder markers retain the application's existing participant-access behavior. This compatibility behavior still needs validation against real historical data before broad security claims. Evidence: `recording-access-result.json`, `container-recording-check.log` and `server/src/__tests__/recording_access.test.ts`.

### P2 — Verification built development React runtime into frontend assets

The verification environment inherited `NODE_ENV=test` during frontend builds. The landing bundle included development runtime and failed its 125,000-byte gzip budget at 139,743 bytes.

Development made frontend build steps explicitly use production mode in the CI workflow and the QA runner. The unchanged budget now passes at 78,963 bytes (77.1 KiB), with all page checks passing. Remote GitHub CI has not been executed for these uncommitted changes.

### Release security blocker — Two existing GitHub tokens exposed by an initial diagnostic

The initial Git remote inspection displayed two pre-existing tokens embedded in remote URLs in the tool output. This was an avoidable diagnostic mistake. Embedded authentication was immediately removed from local Git configuration, and the remotes now use ordinary HTTPS URLs. No token values are repeated in this report.

Removing local credentials does not invalidate exposed tokens. **Both tokens must be revoked or rotated by the owner.** This remains unresolved and prevents satisfying the mission's credential criterion. The source/history pattern scan found no real credential match, but cannot rule out every possible secret format.

## Remaining issues and required real-world verification

| Blocker or unverified area | Impact |
| --- | --- |
| Railway trial expired, services offline | Cannot deploy or establish cloud backend/database/cache startup |
| Telegram Web awaits account sign-in | Cannot exercise the two real Telegram users |
| Cloudflare browser session belongs to an email other than the required account | No keys were created or objects changed; authorized-email access is needed |
| LiveKit dashboard is reachable, but its account uses a different email from the authorized account | No new test keys created; no real two-way audio, reconnect, latency/stability or playable egress test |
| Two exposed GitHub tokens await rotation | Credential security requirement remains unmet |

Still required after access is restored: create isolated cloud staging with new development credentials; inspect startup/migration/runtime logs; verify public HTTPS/WebSocket and Telegram integration; repeat onboarding, call acceptance/rejection/cancellation, simultaneous/stale actions, reconnect, disappearance, mute, termination and subsequent clean calls with two accounts; verify both voices in playable recordings and metadata; exercise private R2 upload/retrieval, denied access, failed/duplicate upload and shortened development-only retention deletion; test actual provider outages/recovery and cloud restarts; then repeat final regression.

Synthetic signed Telegram launches and webhooks used here are useful integration checks. They do not satisfy the real Telegram, LiveKit or R2 criteria. No live call or recording was claimed as passed.

Continuation check: Railway still reports an expired trial and 0 of 3 services online, and Telegram Web still presents its QR-code sign-in screen. The LiveKit project dashboard was directly inspected; its account menu confirms an email different from the authorized email, so no test credentials or resources were created. All eight reviewed source hashes still match the tested candidate, Development has completed its verification acknowledgment, and no Docker containers are running. Evidence: `artifacts/qa-20261004/blocker-recheck-2.json`. These observations do not satisfy the remaining production-readiness criteria.

## Credentials and resources created

No external service account, real Telegram bot token, LiveKit key, R2 key/bucket, cloud deployment or public tunnel was created. Existing provider secret values were not reused for testing.

| Name or purpose | Disposition |
| --- | --- |
| Isolated PostgreSQL password for `pairtalk_check` | New random test password; corresponding database container removed |
| Isolated `JWT_SECRET` | New random local test secret; no external account access |
| Isolated `MASTER_PASSWORD` | New random local test secret; no external account access |
| Synthetic Telegram bot and LiveKit identity/secret fixtures | Offline protocol fixtures; no provider-issued credentials to revoke |
| `pairtalk-check-pg-821dbe15` | Removed, including disposable database data |
| `pairtalk-check-redis-821dbe15` | Removed, including disposable cache data |
| Two isolated application runtimes and their internal networks | Removed by lifecycle cleanup |
| `pairtalk-qa-20261004:local` Docker image | Retained build artifact, no running container |
| `pairtalk-qa-gateway-20261004:local` Docker image | Retained gateway verification artifact, no running container |

Final production image ID: `sha256:bd8f608f1129f581e6e9ce0711b58505147f9e3329aa92a818b80a190b4083d5`.

Temporary credential metadata remains at `C:\Users\abdumutolib\AppData\Local\Temp\pairtalk-isolated-zhaasf\runtime.json`. Automatic approval review rejected both recursive directory cleanup and the narrower single-file deletion with “blocked by policy,” without a detailed reason. No further deletion workaround was attempted. The credential targets have been removed; manually delete this file to finish cleanup.

## Git changes

Branch: `codex/backend-admin-remediation`.

Starting and current HEAD: `7c43bcf4cab906b52ab437638d76e368c91d0091`.

The repository had substantial staged, unstaged and untracked work at entry. The baseline was saved before modifications, and unrelated changes were preserved. Fixes were assigned to the existing **Development** chat and independently reviewed and retested here. Mission changes include deletion failure propagation, shared bot/HTTP recording access checks, the two regression files, explicit production-mode verification builds and QA evidence/report files. Local Git remote authentication was removed after the credential incident.

No commit, push, pull request or cloud deployment was performed. The release image reflects the tested working tree, not a newly published commit. Existing staged work remains intact.

## Final verification

Verified locally: migrations and schema alignment; database/cache concurrency and durable recovery; signed launch and webhook checks; recording ownership enforcement for identified owners; failed deletion retry; relevant negative security cases; builds; both signaling transports; fail-closed readiness and graceful shutdown; repeated integration/lifecycle checks; workstation runtime cleanup.

Unverified externally: reliable cloud startup, real bot interaction, two-user calls, two-way audio, repeated live calls without stale state, playable recording production, actual private R2 behavior and retention deletion, remote CI, and end-to-end final regression. The exposed token issue remains open. Production readiness cannot be declared.

## Manual actions for the owner

1. Revoke or rotate both GitHub tokens formerly embedded in the `origin` and `production` remote URLs.
2. Restore Railway hosting through the account's billing controls.
3. Sign in the two Telegram test accounts in separate browser profiles and provide Cloudflare/LiveKit access through `abdumutolib00@gmail.com`. Keep passwords, verification codes and key values out of chat.
4. Delete the temporary `pairtalk-isolated-zhaasf\runtime.json` file listed above.

Account sign-in remains an owner action because the [Computer Use guidance](C:/Users/abdumutolib/.codex/plugins/cache/openai-bundled/computer-use/26.930.31730/docs/guidance.md) says “Do not automate user authentication dialogs”.
