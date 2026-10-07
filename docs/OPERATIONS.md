# Operations and release follow-ups

Reviewed 2026-10-05. Local verification is recorded in [Verification](VERIFICATION.md); it is not production approval.

## Required before release

- Confirm rotation/revocation of the two GitHub credentials reported exposed during the 2026-10-04 diagnostics. Removing embedded credentials from Git configuration did not revoke them. Never include their values in documentation.
- Use a separate staging bot, database, Redis, LiveKit project, and private object-storage bucket.
- Test real Telegram admin OTP, purchases/refunds, two-account calls, microphone denial, reconnect, both voices in playable recordings, download denial, and storage expiry/retry.
- Back up and rehearse migrations on a restore. Drain active calls and deploy the recording lifecycle migration with Node and Go together.
- Confirm remote CI results for the release revision. Historical local results are not evidence of a current remote workflow.
- Measure actual host/device latency, memory, and call stability before promising throughput.

The 2026-10-04 review found unavailable Railway services and missing or mismatched provider account access. Those are dated observations; provider access was not rechecked during documentation cleanup.

## Recovery work

| State | Operator action |
| --- | --- |
| Stars REFUND_PROCESSING / provider ambiguity | Check provider and saved charge state; use existing recovery, avoiding a second manual refund |
| Notification UNCONFIRMED | Reconcile whether Telegram delivered before requeueing |
| Backlogged PostCallJob | Check leases, retries, database health, and oldest eligible work |
| Recording deletion failure | Restore storage access/delete permissions; retain keys for retry |
| Historical orphan object / missing owner metadata | Reconcile storage listings and retained logs; do not infer ownership from absence |
| Crawler lease loss / interrupted ingestion | Confirm current lease owner and next crawl; do not force overlapping workers |

Queue capacity and completed-job retention need monitoring. Review the privacy footprint of notification payloads, audit logs, and payment proofs. Bulk announcement progress is not durably resumable across every restart. Crawler shutdown drain is not established by the lifecycle tests.

## Product decisions still open

Current subscriptions remain authoritative. Included-usage periods use existing legacy helpers; calendar-month versus full-validity semantics for custom terms still need a single approved policy before a billing redesign.

The planned [unit purchase system](unit-pricing.md) requires a durable credit ledger, confirmed prices/minimums, matched optional storage, successful-delivery rules, and separate migration/checkout work. Lifetime credits remain unimplemented. Bot registration now records durable PDF terms acceptance; see [Bot and dashboard](BOT_AND_DASHBOARD.md).

Current refund code permits eligibility when purchase age is under 48 hours **or** usage is below 10%; older docs incorrectly said both were required. This is documentation of the current rule, not an approved new policy. Review this and all served customer copy before changing or releasing terms.

## Security fixes and rollout

The 2026-10-07 deployment cleanup updates the runtime proxy dependency and removes development/test packages from the backend image while retaining the Prisma migration CLI. The production-only npm audit passes. The existing backend Vitest 1 toolchain still has five development dependency advisories (two critical, one high, two moderate); upgrading that test runner remains separate work. Do not expose its development/UI server. These tools are excluded by the production image's npm prune step. Frontend deployment dependency audits pass after patched transitive overrides.

The 2026-10-06 remediation adds durable readiness/media authorization, separates room capture from personal recording intent, bounds gateway polling and public question work, fixes crawler response rejection and refund-initiation ownership, strengthens recording keys, and corrects encryption claims.

For migration `202610060001_media_authorization`, stop/drain old Node and Go call-serving processes before applying it, then deploy both updated backends together. Previously ACTIVE sessions are conservatively marked media-authorized because their old tokens already permitted reception. Do not run old permissive token issuers alongside the subscription gate. New sessions remain free on failed joins until the gate opens; this does not depend on webhook delivery. Confirm permission updates, reconnect, room recording notifications, and charged departed sessions with the deployed LiveKit version in staging.

The eight 2026-10-05 findings were fixed locally: room-state authorization, client charge opt-out, stale invoice entitlement, lost recording ownership, lost historical keys, replica OTP replay, request-triggered global IP penalty, and CSV formulas. Regression suites exist in both backends.

The additive migration introduces activeRecorderIds, recordingKeys, and entitlementApplied. Old processes can still clear ownership or misinterpret retained egress IDs, so avoid a mixed-version rollout. Already-lost historical keys/owners require reconciliation; the migration only backfills known metadata.

Runtime credentials, databases, recordings, and active services are excluded from repository cleanup. No production deployment, migration, payment, or account action is performed by maintaining these docs.
