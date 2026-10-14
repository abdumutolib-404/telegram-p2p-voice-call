# Staging readiness checklist

Prepared October 14, 2026 for [the readiness work](READINESS_IMPLEMENTATION_2026-10-14.md). This is an execution checklist, not a record of completed tests.

## Test environment and evidence

The owner confirmed on October 14 that the existing documented deployment is development, Railway holds its provider configuration, pushing main deploys the development services, and two Telegram accounts/devices are available. Use that environment for ordinary registration, call, recovery and recording checks. Record service names, the backend/client/gateway commit, applied migrations and the two test-account aliases without credentials or Telegram launch signatures. Use owned disposable fixtures before exercising financial or destructive retention cases; development designation alone does not make existing records disposable. Use test funds/accounts appropriate to that environment; review the concrete transaction before any real-money test.

For each case retain the trigger, observed result, relevant request/session correlation, redacted logs and final database/provider state. Capture before/after allowance totals. Store provider screenshots and recordings privately and exclude tokens, signed URLs, personal identifiers and payment proofs from shared source artifacts.

## User and provider journeys

| Case | Procedure | Pass condition |
| --- | --- | --- |
| Registration and consent | Launch both accounts through the correct bot, accept current PDF terms and complete profiles. Repeat with outdated consent, declined terms and an invalid/expired launch. | Registered users reach the dashboard; recovery instructions match the bot; declined/outdated/invalid access cannot enter calls. |
| Initial call | Match two devices. Confirm each microphone and remote audio before proceeding. | Both voices are audible. The timer starts at persisted media authorization and both clients share the same deadline. A never-authorized failed join consumes no allowance. |
| Mid-call reopen | Reopen a 15-minute authorized call after ten minutes; also reconnect signaling on each backend. | About five minutes remain, with normal network tolerance. No immediate `time_limit_reached`, fresh full-duration restart or duplicate accounting occurs. |
| Partner reconnect | Interrupt one device briefly and return within grace; also exercise the terminal disconnect case. | Authorized time continues. Recovery state and remaining time are truthful; terminal completion reaches both users and happens once. |
| Failed voice join and retry | Reject the LiveKit join, then immediately retry while server cleanup is delayed. Recover connectivity and retry again. | A finish request is issued, local media is released, duplicate retry is blocked, and no new queue admission occurs while the old session is active. Searching resumes after terminal confirmation. |
| Other active session | Reopen the dashboard on another device/account session while retry is shown. | The UI offers recovery and never finishes a different active room merely to start a search. |
| Microphone denial/autoplay | Deny microphone access, retry, allow it, and exercise the three-denial exit. Test iOS/Android app switching and blocked autoplay. | Pending/failure states remain usable; exit and charging follow persisted authorization and duration; both users can hear audio after recovery. |
| Recording intent and disclosure | Start/stop recording from each device, reconnect and restart capture in the same call. | Room capture and personal saved-copy intent are distinct, acknowledgements are truthful, and the room's recording status remains visible to both participants. |
| Recording output and delivery | Finish the recorded call; play all segments and use “Send to Telegram.” Exercise slow delivery and an ambiguous provider response. | Both voices are playable. Segment ownership is correct. Queued/unconfirmed states never become sent without acknowledgement; retry does not create duplicate delivery. |
| Recording denial/expiry | Use a third account, expired access and a short-retention disposable object. Temporarily reject deletion, then restore it. | Unauthorized/expired retrieval is denied. Expiry and deletion retries preserve tracked keys until confirmed cleanup. |
| Allowances | Check free accounts around UTC month rollover and a paid custom-validity account, with and without bonus calls. | Displayed period/balances match authoritative queries. Paid expiry is not described as automatic paid renewal; bonuses remain separate and non-expiring. |
| Payments/refunds | Purchase an eligible offer, repeat settlement callbacks, request an eligible refund, and exercise an ambiguous provider outcome. | Entitlements/refund state change once, ownership is enforced and recovery does not issue a second provider refund blindly. Capture before/after balances and provider charge state. |
| Admin OTP | Request and consume a staging Telegram challenge, retry it, and switch replica. | A valid challenge works once; replay/replica changes do not create a second valid login. |

## Persistence, rollout and operational checks

Use the guarded commands in [Verification](VERIFICATION.md) with owned disposable PostgreSQL/Redis bindings: migrations, schema drift, Node integration, all Go tests and Go vet. Explicitly confirm `TestIntegrationRecoveryUsesOriginalAuthorizedTiming` ran rather than skipped. On a supported Linux environment also run the race detector.

Rehearse the existing recording/media migrations on a database restore. Drain old call-serving processes and deploy coordinated Node/Go/client changes. The new summary contract must be available before relying on the new client restart flow; if session status is missing, the client deliberately keeps retry from starting a search.

Interrupt Redis/database and recover them in staging; inspect readiness and durable work recovery. Exercise shutdown with active requests and confirm terminal jobs/recording metadata persist. Observe actual call stability, latency and host resource usage before setting a capacity claim.

Record completion against the exact release revision. The repository has no GitHub verification workflow at present; manual checks and hosting build/deployed-commit evidence are required. Leave any unexecuted or ambiguous case open.
