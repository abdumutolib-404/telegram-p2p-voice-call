# Operations and release follow-ups

Reviewed 2026-10-16. Current evidence and limitations are in [Launch readiness](LAUNCH_READINESS_2026-10-16.md); reproducible checks are in [Verification](VERIFICATION.md). Historical local results do not establish a current deployment.

## Deployment scope and launch gates

- `origin/main` and the existing Railway/Cloudflare services are development, including the Railway environment named `production`. The separately configured `production` Git remote and public-domain deployment are outside default release scope. Do not create replacement services or sites.
- The owner confirmed on October 16 that both GitHub credentials reported exposed in the October 4 diagnostics were revoked or rotated. The historical gate is closed. Source-pattern scans alone do not prove revocation; never include credential values in documentation.
- Existing device confirmations cover equal-band matching, 60-second recovery with original timing and both voices, and a single playable Telegram audio delivery. Record any new live admin OTP, payment/refund or channel-permission check against its exact release; synthetic acknowledgements do not verify provider permissions or settle real transactions.
- After application release `0d88fa7` on October 16, the owner confirmed a real Stars practice-pack purchase and refund both worked. The read-only channel connection check initially failed, then passed after the owner enabled the bot's administrator/Post Messages capability in @pairtalk. Keep that capability enabled for starter membership checks and channel offers. No live campaign was sent by the verification tools.
- Keep calls and provider cleanup drainable across backend changes. The shared recording/credit schema requires compatible Node/Go versions. Existing development migrations were applied for the October 16 release; check the actual deployment rather than rerunning historical destructive rollout instructions.
- Push through the primary checkout to `origin/main`, verify all three existing frontend builds use that commit, then verify backend deployment, health and migrations. A local preview or branch build is insufficient.
- No GitHub verification workflow currently runs these application checks. Use the guarded local commands and provider build results. Measure actual device and hosted load before advertising concurrency or fixed wait-time guarantees.

## Current product and billing

Practice packs sell calls and recordings separately, with 15- or 30-minute duration and optional 30-day retention. A 30-minute service spends two 15-minute units. Unused purchased quantities do not expire. The published catalog, server quote and invoice are authoritative; recording sales remain capacity-limited. Legacy subscriptions retain their original entitlements.

New practice-pack refunds require a full unused purchase within 48 hours and all purchased quantities available and unreserved. Refund holds and settlement are idempotent. Legacy subscription refunds retain their original rules. See [the purchase specification](unit-pricing.md) and served policies rather than applying a legacy OR condition to all new purchases.

Starter calls require a one-time channel-membership claim. Campaign claims are unique per user/campaign, capacity and expiry are enforced on the server, and later campaigns can select the same user again. Optional private reminders require consent and observe configured cooldown/quiet hours. Channel membership alone is not promotional-message consent.

## Recovery work

| State | Operator action |
| --- | --- |
| Stars refund processing / ambiguous provider result | Reconcile the saved charge and provider result before any further refund attempt |
| Notification UNCONFIRMED | Reconcile whether Telegram delivered before requeueing; do not blindly resend |
| Recording delivery UNCONFIRMED | Check the existing Telegram conversation/receipt. Status reads do not requeue uncertain delivery; a late confirmed receipt can settle the original claim |
| Recording delivery FAILED | Resolve the known rejection, then use the explicit History retry action |
| Pending receipt or checkout | Check persisted order ownership, currency, authorization, expiry and reservation state; a pending order grants no balance |
| Backlogged PostCallJob | Check leases, retries, database health and oldest eligible work |
| Restricted call cleanup pending | Keep durable cleanup queued; room closure and recording cleanup can retry independently |
| Recording deletion failure | Restore storage access/delete permission and retain keys for retry |
| Historical orphan object / missing owner metadata | Reconcile retained ownership evidence; absence of metadata does not prove who owns an object |
| Crawler lease loss or interruption | Confirm the current lease owner and next cycle; do not start overlapping workers |
| Bulk announcement interruption | Inspect durable broadcast/cursor/job state; do not restart a fresh broadcast to replay the completed audience |

Monitor queue capacity, oldest work, completed-job retention and the privacy footprint of payloads, audits and proofs. Provider uncertainty must remain visible instead of being reported as successful delivery or deletion.

## Security and verification

The backend runtime image prunes development/test/deployment tools while retaining the Prisma migration CLI. The October 16 review updates the old backend Vitest toolchain to the patched versions already used by the frontends; current dependency audits are recorded in the launch evidence. The webhook regression mock was made constructible for the newer runner without weakening its assertions or changing real signature checks.

Member authentication and dashboard gates use the same account-restriction predicate as admission/checkout, including future suspension dates with stale flags. The call router was already protected by the main server middleware; an isolated-router bypass candidate was withdrawn after checking the real mount. Do not present that test-fixture omission as a deployed security defect.

See [October 14 implementation evidence](READINESS_IMPLEMENTATION_2026-10-14.md) for earlier transport and lifecycle work. Historical lost keys/owners still require reconciliation; later migrations cannot reconstruct unknown ownership. Runtime credentials, ignored local artifacts, recordings, databases and active services are excluded from repository cleanup. The editable DOCX remains local pending the owner's requested native rendering; it is not a release deliverable.
