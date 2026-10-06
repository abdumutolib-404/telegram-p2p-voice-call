# Flexible unit purchases — planned

Status: product specification, not an active checkout. Current Free/Plus/Pro/Boss subscriptions, prices, counters, and refunds remain unchanged.

## Owner-selected direction

- No named plans, fixed packs, or preset bundles for the future flow.
- Users independently choose call and recording quantities, subject to configurable positive minimums and whole-unit increments.
- Zero recordings is allowed. Buying extra calls must not require recording or storage purchases.
- Unused paid call and recording credits do not expire merely because a month passes.
- Storage is an optional checkbox. When selected, its entitlement quantity equals the selected recording quantity; there is no independent storage-quantity input.
- Each successfully created recording with storage is preserved for 30 days. Its retention clock begins when created, not when unused credits were purchased.
- Show unit cost, minimum purchase, line subtotal, and overall total in Stars and clearly explained UZS amounts. Do not invent a fixed Stars exchange rate.

| Item | Unit | Selection |
| --- | --- | --- |
| Calls | One participant's qualifying practice session, with a disclosed maximum duration | Independent quantity |
| Recordings | One successfully delivered recording for a session the buyer joined | Optional quantity |
| Storage | 30 days of hosting for each selected recording | Checkbox; quantity matches recordings |

Credits remain unused until the defined qualifying service succeeds. If recording fails because the service cannot deliver it, restore the recording credit and do not consume storage. A credit is not permanent hosted audio or a guarantee that the business operates forever.

## Recording without storage

The intended direction is one-time delivery, followed by server deletion. Delivery must succeed and have a defined retry/recovery window before deletion; initiating a send is not proof of delivery. Telegram delivery may leave a copy in the user's chat or Telegram systems after PairTalk deletes its own object. The exact delivery method, temporary window, failure recovery, and privacy wording still need implementation and approval.

## Rates and limits still to confirm

Exact launch prices, maximum call/recording durations, minimum positive quantities, purchase increments, and any checkout minimum remain unsettled. Earlier $0.10 examples, 90-day credit expiry, included storage, and independent storage extensions were exploratory scenarios and are superseded. They are not a live price list.

Recalculate costs using actual call minutes, recorded minutes, object size, retention, delivery, hosting, and net payment proceeds. Record dated inputs before approving a catalog. No old cost estimate should silently become a production price.

## Required implementation

1. Define one versioned catalog and qualifying-use/failure rules.
2. Add durable purchase and usage records with transactional, replay-safe credit consumption understood by Node and Go.
3. Preserve legacy subscriptions and historical paid value during migration.
4. Connect the bot, public calculator, admin controls, and receipts to that same catalog.
5. Implement successful-delivery tracking, matched storage, expiry/retry cleanup, and replacement credits.
6. Present readable versioned terms and privacy links, optional PDF, explicit acceptance, and a decline path. General acceptance is separate from recording permission.
7. Test zero/positive boundaries, independent top-ups, concurrency, failed delivery, retained legacy access, and staging provider behavior.

Current sources are [plan.ts](../server/src/services/plan.ts), [planConfiguration.ts](../server/src/services/planConfiguration.ts), [payment handlers](../server/src/bot/handlers/payments.ts), and [Go plans](../gateway/internal/database/plans.go). Subscription counters must not be relabeled as durable purchased-credit balances.
