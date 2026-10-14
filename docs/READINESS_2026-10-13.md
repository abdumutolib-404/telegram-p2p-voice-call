# UX and backend readiness assessment — October 13, 2026

Assessed revision: `fd18442`. This assessment covers the current repository, fresh automated checks, two isolated defect reproductions, and credential-free HTTP checks of the documented development endpoints. Application behavior was not changed or deployed.

## Decision

The product has enough implemented functionality to begin focused design work. The backend has a substantial tested foundation, but launch readiness is not established. Correct call recovery and failed-connection cleanup before polishing those interactions. Settle allowance wording before redesigning billing. Real Telegram, LiveKit and object-storage journeys remain release gates.

This is an engineering and interaction assessment. No new visual browser sweep, physical-device test, formal security scan, database migration rehearsal or load test was performed. Earlier screenshot/accessibility reports are historical evidence, not fresh results for this revision.

## Current readiness by journey

| Journey | Assessment | Evidence and remaining work |
| --- | --- | --- |
| Registration and access | Implemented and locally tested | Bot PDF acceptance is versioned and recorded. The dashboard requires signed identity, registration and current consent; expired or restricted access has recovery screens. Verify actual bot-to-Mini-App launches and renewed consent on devices. |
| Find a partner | Implemented and locally tested | Authoritative admission checks, queue acknowledgement, cancellation, wait guidance and expiry exist. No measured live wait-time distribution or capacity evidence. |
| Voice calls and recovery | Needs correction before final UI work | Microphone retries, audio-unlock actions, recording disclosure and server duration enforcement exist. Rejoin timing and failed-join cleanup have reproduced defects below. |
| History, feedback and saved partners | Ready for design iteration | Participant-authorized endpoints, pagination, pending actions, duplicate-submission protection, rating/report states and invitation polling exist. Full signed end-to-end journeys still need staging checks. |
| Recordings | Implemented; provider verification pending | Ownership, segments, expiry, durable delivery and acknowledgement states exist. Confirm both voices, reconnect segments, playable delivery, denial and deletion using actual providers. Correct the visible delivery label. |
| Plans and payments | Implemented; copy needs a firm contract | Shared live pricing is validated rather than replaced with invented fallback prices. Purchase/refund processing exists. Make allowance periods and renewal dates explicit; exercise actual provider settlement and recovery. |
| Operations | Substantial local foundation | Database transactions, Redis coordination, durable jobs, dependency readiness and shutdown handling exist. Current persistence integration, rollout rehearsal, provider telemetry and capacity remain unverified here. |

## Priority findings

### R1 — Rejoining can terminate a call early (high priority, reproduced)

The active-call API returns the **remaining** seconds in `callDurationLimit`. The client subsequently takes `startedAt` from `call_started`, computes the elapsed time from that original start, and compares it with the reduced limit. `durationSeconds` and `expiresAt` in the event are ignored.

Example: a 15-minute call has already run for 10 minutes. The API returns 300 seconds remaining. When the original start arrives, the call component compares 600 elapsed seconds with a 300-second limit and immediately sends `time_limit_reached`, although five minutes remain.

An isolated React probe reproduced the premature finish callback using the actual call component. The API and event handling establish the contract mismatch; this was not a live provider reproduction.

Evidence: [active-call API](../server/src/routes/calls.ts), [client event handling](../client/src/App.tsx), [call timing](../client/src/components/ActiveCallScreen.tsx).

Required correction: use a consistent original start plus full duration, or an authoritative expiry, across initial joins, reopens and reconnects. Verify a mid-call rejoin preserves the remaining time and does not finish early.

### R2 — A failed voice join leaves the server session active until cleanup (medium priority, reproduced)

When `connectLiveKit` rejects, `handleMatchFound` displays an ended/error screen but does not emit `finish_call`. The separate 60-second connecting deadline is removed when the screen changes to ended. Backend handshake/terminal cleanup remains the fallback.

An isolated App probe rejected the voice connection and confirmed that the recovery screen appeared with zero finish requests. The user can then choose the next partner while the server may still consider the previous session active and reject admission.

Evidence: [match handling and connecting deadline](../client/src/App.tsx), [server handshake cleanup](../server/src/socket/signaling.ts), [gateway active-call admission](../gateway/internal/signaling/handler.go).

Required correction: release the failed attempt through an idempotent server action, and ensure recovery does not start a new search against a stale active session. Test rejected joins and cleanup failures.

### R3 — “Download” actually requests delivery to Telegram (medium priority, source-confirmed UX mismatch)

The history button visibly says `Download`, while its accessible name says `Send audio to Telegram`. Its action invokes the recording-delivery endpoint and shows queued/sent Telegram states. A sighted user can expect a file download in the current app and receive a bot message instead.

Evidence: [RecordingAction](../client/src/components/RecordingAction.tsx), [dashboard delivery flow](../client/src/components/Dashboard.tsx), [delivery endpoint](../server/src/routes/dashboard.ts).

Required correction: label the current action “Send to Telegram” consistently. If direct downloads are desired, design and verify them as a separate action with its own loading, expiry and authorization behavior.

### R4 — Allowance renewal is not sufficiently explicit (product/UX decision)

The practice screen shows calls available, and Account shows remaining calls, per-call minutes, recordings and retention. Neither gives a clear allowance start/end or reset date. `allowancePeriodStart` uses the active subscription's start for paid users and the UTC calendar month otherwise. Operations documentation still calls out custom-term policy as an open decision.

Evidence: [practice screen](../client/src/components/ReadyScreen.tsx), [Account](../client/src/components/Dashboard.tsx), [allowance calculation](../server/src/services/plan.ts), [open product decisions](OPERATIONS.md#product-decisions-still-open).

Required decision: specify exactly what “calls available” covers, when usage renews, how custom validity behaves and how bonus calls expire. Return the period dates from the backend so the UI can explain the authoritative rule. Non-expiring purchased credits remain planned work and should not be presented as implemented.

## Backend strengths and limits

Call admission and completion use participant locks and database transactions. Completion commits accounting and durable post-call work together. Recording access is tied to ownership, and usage is recorded independently of transient client intent. Redis coordinates queue work, presence and leases. Readiness checks cover required database/Redis dependencies and the internal Node backend; an HTTP health success does not prove audio, payments or object storage work.

Node and Go both implement call lifecycle and entitlement rules. That requires paired regression coverage and coordinated rollout whenever shared behavior changes. The repository documents migration drain requirements and known historical recovery work.

Fresh Node tests use the explicit in-memory test database. Go persistence tests skip when isolated PostgreSQL bindings are absent. Docker was unavailable in this environment, so no fresh PostgreSQL/Redis container integration, schema-drift check or migration rehearsal was run. Passing the unit suites therefore does not certify those persistence boundaries.

The existing operations record also requires confirmation of previously reported credential revocation, real provider checks and historical recording reconciliation. Their current completion status was not verified in this assessment. There is no repository GitHub verification workflow; the documented checks are manual. The older instruction to confirm remote CI should be reconciled with that current release process.

## Fresh verification

| Check | Result |
| --- | --- |
| Backend TypeScript (`scripts/verify.cjs build`) | Passed |
| Backend unit suite with synthetic credentials | 84 files / 853 tests passed |
| Client unit suite, one worker | 17 files / 96 tests passed |
| Two temporary defect probes | Both reproduced the behaviors in R1/R2; these are observations of defects, not fix tests |
| Client lint and production build | Passed |
| Admin lint and production build | Passed; lint emitted one Fast Refresh export warning |
| Landing production build, SSR and prerender | Passed |
| Landing content/build checks | Three tests passed; 12 HTML pages and 11 Markdown pages checked |
| Go tests | All eight packages passed; isolated database tests were not bound |
| Go vet | Passed from the gateway module |
| Documentation link check before this report | 150 links across 27 Markdown files passed |

The first client run had six worker-start timeouts and was not treated as a pass. The full one-worker rerun passed. Initial backend dependency installation hit a Prisma engine-download connection reset; installation completed with scripts disabled, then the matching locally cached Prisma 5.22 Windows engines generated the client from this checkout's schema. Backend types and tests then passed. The working dependency workaround did not alter lockfiles.

Credential-free HTTP checks on October 13 found HTTP 200 for the documented development Mini App and admin HTML, the development landing's `/api/public/plans` and `/api/public/stats`, and the configured Railway backend's `/healthz`. Both checked plans endpoints advertised `ieltsSpeakBot` and all four tiers. An exploratory `/api/public/pricing` request returned 404; the actual application endpoint is `/api/public/plans`, which succeeded. No deployed commit identity was established by these checks, and no authenticated call, admin mutation, payment or provider operation was performed.

## Suggested order for the design work

1. Correct R1 and R2 and verify recovery transitions.
2. Agree allowance/renewal wording and make recording delivery labels truthful.
3. Refine task hierarchy across practice, search, call, history and account using the existing implemented state model.
4. Run a fresh responsive browser and keyboard/accessibility pass after the redesign; include loading, empty, failed, pending and acknowledged states.
5. Complete real staging journeys and migration/provider checks before describing the product as launch-ready.

The assessment supports starting design work now. It does not support a launch approval or a throughput promise.

## Implementation follow-up

Work began October 14. [The implementation record](READINESS_IMPLEMENTATION_2026-10-14.md) tracks corrections and fresh verification separately from this original assessment. Real-provider, persistence and rollout gates remain open.
