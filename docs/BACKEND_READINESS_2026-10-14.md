# Backend code readiness — October 14, 2026

This follow-up assesses the application's backend with Railway's managed PostgreSQL and Redis assumed healthy, as the owner requested. It uses the existing development deployment. Checking our transaction, query, ownership and retry behavior is engineering work; it does not require the owner to certify Railway's database products.

## Assessment

The core backend is ready for continued development and the next feature. Admission, call completion/accounting, persisted call timing, recovery, recording ownership and ordinary Telegram delivery have code/test evidence. The owner confirmed fast equal-band matching, the original timer and both voices after reopening, and playable both-voice recordings with correct delivery/status. The readiness corrections and reported navigation, controls background and partner-end errors are implemented; their local regressions pass.

This is development readiness, not a measured capacity or universal launch guarantee. Unexecuted payment/provider failure variants and historical operational tasks remain evidence limits for a later release decision. They do not imply that Railway's PostgreSQL or Redis are defective or block this backend assessment.

## Recording delivery correction

The assessment reproduced a backend defect: Telegram could accept audio, lose the response, and receive a duplicate on the worker's automatic retry. Expired PROCESSING claims had the same uncertainty. A temporary baseline probe observed three accepted sends for two intended recipients; that observation was evidence of a defect, not a passing fix test.

The corrected worker records SENDING before dispatch. Confirmed positive message IDs settle DONE. Failures during preparation remain retryable; explicit Telegram rate-limit rejections have bounded retries. Known rejected requests become FAILED and can be retried through an explicit user action. Unknown responses and expired in-flight claims become UNCONFIRMED and are never automatically resent. A late confirmed response can settle the original claim, including after it was parked. A failed receipt write does not trigger another send.

The signed dashboard endpoint exposes SENT, QUEUED, UNCONFIRMED or FAILED. Status polling cannot reset a failed or uncertain delivery. The UI stops polling terminal outcomes, explains uncertainty, and offers a status check rather than a resend. A retry is offered for a known rejection. Older recordings now use durable receipts too, preserving participant/recorder/retention checks and their existing user-requested delivery behavior.

No database schema change is required. Deploy the updated backend and client together using the existing main-build triggers. An old backend does not implement the new uncertainty handling; avoid retaining old recording workers alongside the updated workers. This correction cannot reconstruct delivery receipts that were already lost before it was installed.

## Verification

| Check | Evidence |
| --- | --- |
| Complete backend unit suite | 85 files / 870 tests passed before three additional worker regressions; the final delivery file then passed all 15 tests, including overlapping workers, bounded rejection retries and legacy delivery scope |
| Complete client unit suite | 18 files / 116 tests passed |
| Backend types and production build | Passed, including Prisma generation and consent-asset copying |
| Client lint and production build | Passed |
| Actual PostgreSQL delivery probe | Production compiled worker, owned loopback PostgreSQL, local synthetic audio and simulated Telegram responses: overlapping claims, uncertain response, confirmed receipt, repeat recovery and expired send claim passed |
| Browser states | 16 checks for uncertain/rejected delivery at 320, 375, 768 and 1440px, plus both themes on short phone/landscape layouts; no checked overflow, automated WCAG A/AA violations or collected browser errors; keyboard and reduced-motion checks passed; representative capture inspected |

Most Node unit tests use the repository's explicit in-memory adapter. The separate PostgreSQL probe exercises actual SQL behavior but simulates Telegram; it is not a new live Telegram fault test. Its synthetic rows/files were removed and the owned local database stopped afterward. No existing Railway records were deleted. Earlier migration, UTC, Go persistence and two-device evidence is recorded in [the implementation record](READINESS_IMPLEMENTATION_2026-10-14.md) and [development validation](DEVELOPMENT_VALIDATION_2026-10-14.md).

Publication evidence is recorded separately after pushing main and checking the existing backend status and all three active frontend build revisions.
