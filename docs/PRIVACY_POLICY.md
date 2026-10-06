# Privacy and recording — repository draft

Status: implementation-aligned draft reviewed 2026-10-05. This Markdown is not loaded by the public landing and does not change published policy or create a compliance certification. Approve the final operator identity, contact details, retention schedules, and customer wording before publication.

## Data handled by the application

The backend stores Telegram account IDs, aliases, self-reported practice criteria, session metadata, feedback/reports, entitlements, payments/proofs, appeals, and audit/job records. Signed Telegram launch data can contain profile fields; validation is not a guarantee that the service never receives a name or username.

Infrastructure handles network addresses and service logs. Operators must set log access and retention; the repository does not establish a universal no-IP-logging or zero-knowledge guarantee. Question CSV exports neutralize spreadsheet formulas without changing stored question text.

## Audio and recordings

LiveKit carries audio. Transport security must not be described as end-to-end secrecy from the media service. Optional recording creates an output processed by the provider and stored on configured local or private S3-compatible storage.

Discuss informed recording permission before starting. General terms acceptance does not by itself establish permission for each session, and the current backend must not be advertised as a verified two-party consent ceremony.

Saved download access checks session participation, saved owner markers, expiry, and requester entitlement. Stopping recording does not erase saved ownership. Legacy missing/shared markers retain existing participant compatibility; already-erased historical owners need reconciliation.

Current retention is controlled by backend plans/overrides and session deadlines, not a permanent-storage promise. The cleanup worker tracks historical keys and retries failed deletes. Expired access does not prove an external delete succeeded immediately. Copies already downloaded or sent through Telegram may remain outside PairTalk's storage.

## Payments, jobs, and service providers

Payment records are needed for settlement, review, and refund recovery. Durable notification/post-call jobs can contain private delivery content. Database, logs, provider accounts, and private buckets require appropriate operator access controls and retention procedures.

The deployment selects Telegram, LiveKit, hosting, and storage providers. The repository does not prove signed processing agreements or a specific legal compliance status.

## Requests and customer policy

Provide a reviewed support route for access/deletion questions. Do not advertise guaranteed 24-hour account erasure: a complete automated purge and legal-record retention policy are not established here.

Refund behavior is documented in [Operations](OPERATIONS.md) and [Terms draft](TERMS_OF_SERVICE.md); this draft does not grant a new instant-refund guarantee. See [State and storage](STATE_AND_STORAGE.md) for current implementation and [unit pricing](unit-pricing.md) for unimplemented future delivery/storage choices.
