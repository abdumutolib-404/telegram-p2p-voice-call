# State and storage

Reviewed 2026-10-05. [schema.prisma](../server/prisma/schema.prisma) is authoritative for columns, indexes, relations, and defaults; [migrations](../server/prisma/migrations/) define deployed schema changes. Avoid maintaining a second exhaustive column dictionary.

## Durable PostgreSQL models

| Models | Responsibility |
| --- | --- |
| User | Telegram identity, alias, self-reported criteria, entitlement overrides, moderation |
| CallSession | Participants, terminal state, authoritative timing, recording ownership and keys |
| CallRating | Participant feedback and reports |
| StarsTransaction / ManualPaymentRequest | Payment, entitlement application, review, refund recovery |
| AuditLog | Operator changes and persisted plan configuration |
| NotificationJob / PostCallJob | Durable delivery and post-call work |
| FavoritePartner / ReferralReward / Contest | Invitations, referrals, and contest state |
| UnblockAppeal | Moderation appeal review |
| IeltsTopic / IeltsQuestion / CrawlerSyncLog | Question bank and ingestion records |

The schema currently has 15 models. String statuses are application contracts; not every status is a database enum.

## Call and recording invariants

`createdAt` is admission time; terminal duration is at least elapsed server time. A completed call of five seconds or more consumes allowance once. Client readiness and reasons cannot opt out. Genuine short failures and cancelled sessions remain free.

| CallSession field | Meaning |
| --- | --- |
| `egressId` | Latest egress binding, retained after stop for matching callbacks |
| `activeRecorderIds` | Participants currently requesting recording; null means no active intent |
| `recordedByUserId` | Saved-file access marker; stopping does not erase it |
| `recordingUrl` | Latest finalized recording key/URL used by existing download delivery |
| `recordingKeys` | Historical generated object keys retained until deletion succeeds |
| `recordingExpiresAt` | Session cleanup deadline; access also checks requester entitlement |

Saved owner markers support participant IDs and legacy null/BOTH/ALL conventions. Legacy shared access is preserved for compatibility; do not infer private ownership from missing historical metadata. A new segment establishes its own saved owner set. Archived keys support cleanup, not a new public per-segment download catalog.

Node [recordingLifecycle.ts](../server/src/services/recordingLifecycle.ts) and Go [queries.go](../gateway/internal/database/queries.go) change intent under persistent locks. A predicted key is persisted before external egress. Signed finalization adds actual keys, while only the latest matching egress can replace the latest URL. Completion reads current persisted state rather than restoring a stale cached key.

[storage.ts](../server/src/services/storage.ts) deletes unique historical keys for eligible terminal sessions, including sessions with no latest URL. Failed deletions remain for retry. After deleting objects, metadata cleanup rereads under lock so a late webhook's new key is not discarded.

## Payments and durable delivery

`StarsTransaction.entitlementApplied` defaults true for historical purchases. Incompatible settlement records false and enters refund processing. Confirmation of an unapplied refund must not revoke another entitlement. Provider ambiguity stays pending for reconciliation.

Completion writes one PostCallJob atomically with accounting. Redis hints accelerate processing; the database worker also polls. Notifications have durable deduplication and leases. A stale uncertain Telegram send becomes UNCONFIRMED; automatic replay would risk duplicate delivery.

## Redis and process memory

Redis stores ephemeral matchmaking state, distributed rate limits, bot/crawler leases, OTP challenges, and event channels. Exact prefixes/TTL policies live beside their implementations, including [rateLimitMatrix.ts](../server/src/services/rateLimitMatrix.ts), [telegramTransport.ts](../server/src/bot/telegramTransport.ts), and [admin.ts](../server/src/routes/admin.ts). They are not durable payment or recording ledgers.

A successfully persisted admin OTP has no local shadow. Missing/consumed challenges and Redis errors do not permit shared-challenge reuse. Nonproduction memory-only fallback applies only when initial persistence fails. Suspicious requests do not write automatic persistent global IP jails; trusted operator controls remain.

## Migration and historical limits

The recording lifecycle migration adds activeRecorderIds, recordingKeys, and entitlementApplied, and backfills known URLs/legacy active intent. Deploy both backends together after draining calls. Missing old object keys and erased owner metadata require separate storage/log reconciliation; migration cannot invent them. Keep database/object-storage backups and review deletion failures. See [Operations](OPERATIONS.md).
