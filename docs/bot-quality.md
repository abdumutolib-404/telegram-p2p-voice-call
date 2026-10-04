# Telegram bot review

The bot remains grammY/TypeScript with the existing subscriptions and callback contracts. All verification used test doubles or dedicated local PostgreSQL/Redis services. Real polling, Telegram settings and live accounts were not changed.

## Confirmed changes

- Callback acknowledgement now precedes sequentialized work, and a repeated acknowledgement shares its first promise. Redis update reservations distinguish processing, completion and uncertain mutation outcomes; uncertain updates are not blindly replayed.
- Production sessions require Redis. Database/Redis errors do not silently switch persistent application state to an in-memory implementation. Explicit NODE_ENV=test continues to use isolated mocks.
- One Redis token-scoped lease owns polling. Polling concurrency is bounded at 50, failures use bounded backoff, ownership loss stops polling, and obsolete polling tenures cannot interfere with a newer lease.
- The outbound transformer coordinates token and chat pacing across replicas with Redis TIME/Lua. It uses a conservative global pace, one-second private-chat spacing and three-second group spacing. Queues and concurrent work are bounded. Telegram 429 retry_after is honored within a bounded retry/deadline policy; ambiguous network failures are not automatically replayed as mutations.
- Telegram timing/error records omit tokens. TLS verification remains enabled. Callback and polling shutdown paths stop their runners before relinquishing ownership.
- Notifications are persisted before worker delivery and claimed atomically across replicas. The queue permits at most 1,000 outstanding jobs and prioritizes urgent messages. Queued work survives a restart. A stale SENDING lease becomes UNCONFIRMED for manual review instead of duplicate automatic delivery.
- Node and Go commit one PostCallJob with a call's terminal status and allowance writes. Node polls PostgreSQL even if Redis Pub/Sub loses the event. Replica leases, expired-lease recovery and unique notification keys make database processing repeatable. A referral award and its notice commit together. Review cards and microphone-denial notices use saved participants and recorder access; Pub/Sub recipient/alias/recording fields cannot redirect delivery. Failed database processing retries with capped backoff. Shutdown stops further claims and awaits current work before disconnecting the database.
- Subscription expiration rechecks the user under a row lock, so a concurrent renewal survives. The plan transition, audit and notice now commit together; advance notices use fresh locked subscriptions and durable deduplication. Bot absence leaves recoverable queued notices, and a full queue rolls back the transition for retry. Expired paid entitlements still take effect immediately during quota checks before scheduled cleanup. Legitimate zero overrides remain zero. Reminder counts report notices queued, rather than claiming delivery.
- Direct invitations and matchmaking share participant locks. Invitation acceptance rechecks current bans and allowances before activation.

## Financial handling

Stars refunds reserve a persistent transition before calling Telegram and revoke only after provider confirmation. Ownership and eligibility checks run before the provider call. Concurrent administrators cannot issue a second refund. An ambiguous provider outcome remains pending for reconciliation; a definite rejection preserves the subscription. Refunding an old purchase preserves a newer entitlement. Administrative audit entries record the transitions.

Manual purchase creation and approval use user row locks. Refund proof is independent from the original receipt. A refund cannot revive a rejected or completed request; a rejection cannot resurrect a completed refund.

## Evidence and remaining limits

The full server test suite and real PostgreSQL/Redis checks are recorded in [remediation-and-upgrade.md](remediation-and-upgrade.md). Integration checks exercise replica lease ownership, atomic pacing, call races, duplicate pending purchases, concurrent approvals/refunds, provider rejection, notification recovery and uncertain delivery handling.

Telegram delivery is not exactly once: Telegram offers no general sendMessage idempotency key. UNCONFIRMED notification jobs require an operator to reconcile before sending again; outbox replay preserves that status. Retention/purging of completed notification and outbox rows is an operational follow-up; delivery payloads contain private user content and need database access controls. The completion outbox covers review cards, qualifying referral awards/notices and microphone-denial notices. Other producers that fail before persisting a notification still have no durable job to recover. Bulk announcement campaigns retain their existing bounded best-effort execution; full campaign progress is not persisted across a process restart.

The provider-confirmed “already refunded” reconciliation recognizes explicit charge/payment-already-refunded descriptions only. Unrecognized provider responses remain unconfirmed; they do not grant permission to revoke access. Real refunds and polling must be validated in a dedicated Telegram staging bot before production release.

Pacing and retry behavior follow the [Telegram Bot FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this), [grammY transformer contract](https://grammy.dev/advanced/transformers), and [refundStarPayment response contract](https://core.telegram.org/bots/api#refundstarpayment). The application applies conservative limits rather than claiming a guaranteed delivery rate.
