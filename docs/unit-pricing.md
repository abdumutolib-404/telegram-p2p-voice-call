# Unit pricing and flexible purchases

Status: product specification for review. New unit purchases are not yet implemented or advertised as available. Existing subscriptions, balances, payment routes, prices and refund rules are unchanged.

## Agreed direction

Every purchasable item must explain its unit, unit price, minimum purchase, quantity and total. Learners can buy more calls without being required to buy recordings or longer storage. Recording purchases are optional, including a quantity of zero. No automatic recurring payment is introduced by this specification.

Latest owner clarification: the purchase flow has no named plans, fixed packs or preset bundles. Users enter their own call and recording quantities, subject to configurable positive minimums and whole-unit increments, and optionally select storage for the recordings they choose. Each line shows its unit rate and subtotal before the overall total. The owner's recording minimum examples (three or five) are not final business values.

Recommended credit policy for this direction: unused paid call and recording credits carry forward without a monthly reset or scheduled expiry while the service operates. This is a recommendation for review, not a lifetime service guarantee or an existing entitlement change. Finite storage is separate: a purchased retention entitlement starts when a recording is successfully created, not when unused recording credits are purchased. Do not promise permanent or ten-year hosted storage at the earlier one-time unit prices.

Distinguish an unused recording credit from a failed recording. A customer who does not request recording retains the credit. If a requested recording fails because the service cannot deliver it, restore the credit and do not consume its storage entitlement; payment remedies still follow the applicable purchase terms and platform obligations. The exact creation, completion and failure rules must be implemented consistently across Node and Go.

The owner requested all components and totals in "sum and Stars". This is interpreted as Uzbek so'm (UZS) plus Telegram Stars, with an overall order total also shown. Unit tables and order summaries must include both columns. Stars are the payable amount for digital-service invoices inside Telegram. Any UZS reference must explain its basis and whether it is approximate; a fixed universal Stars-to-UZS consumer exchange rate must not be invented. This display request does not approve a new UZS checkout method.

The owner's earlier examples were $0.10 per unit and a minimum of ten units. The owner subsequently asked us to calculate the initial rates. A concrete recommendation, cost assumptions and order arithmetic are recorded in [Calculated launch proposal](unit-pricing-calculation.md). Those recommendations are for review and must not become live prices by assumption.

## Pricing presentation

| Item | Unit explanation | Required price details | Selection |
| --- | --- | --- | --- |
| Practice calls | One person's participation in one qualifying session, up to the confirmed duration limit | Exact unit rate, minimum quantity, allowed quantity increments, selected-quantity total and credit validity | Independently purchasable; zero is valid for a recording-only top-up |
| Recordings | Access to a successfully produced recording for a session in which the purchaser participated, up to the confirmed recording duration | Exact unit rate, minimum positive quantity, delivery window without storage and total | Optional; zero means no recording purchase or charge |
| Storage | A stated retention period for clearly identified existing recordings or future recording entitlements | Exact per-recording rate, affected quantity, period, total and resulting deletion dates | Optional checkbox; retention begins after successful recording creation |

The public pricing page should show the unit table and a quantity calculator with separate call and recording inputs and an optional storage checkbox/period selector. The bot should present the same breakdown before payment. Do not require users to choose a named plan or fixed pack. A purchase must contain at least one eligible paid item. Storage quantity cannot exceed the selected eligible recording quantity; do not add storage charges to all calls automatically.

Suggested customer copy, to fill only from confirmed catalog values:

> **Practice calls** — [price] Stars each. Buy at least [minimum]. Each credit covers a session of up to [minutes]. Your [quantity] credits cost [total] Stars and expire on [date].
>
> **Recordings** — optional. [price] Stars each. Download within [delivery window] after creation, or choose optional storage below. Selecting zero adds no recording charge.
>
> **Storage** — optional. [price] Stars per selected recording for [days] days after creation. Your [quantity] storage entitlements cost [total] Stars. Existing recordings show their resulting deletion dates.

Order breakdown:

| Selection | Quantity | Unit price in Stars | Unit UZS reference | Line total in Stars | Line UZS reference |
| --- | --- | --- | --- | --- | --- |
| Practice calls | Selected call quantity | Confirmed rate | Clearly labeled basis | Calls × rate | Matching disclosed reference |
| Recordings | Selected recording quantity, including zero | Confirmed rate | Clearly labeled basis | Recordings × rate | Matching disclosed reference |
| Retention extension | Selected eligible recordings | Confirmed rate for selected period | Clearly labeled basis | Eligible quantity × extension rate | Matching disclosed reference |
| **Order total** | | | | **Sum of payable lines** | **Sum of disclosed references** |

Display each item's minimum and allowed increments beside its quantity control. Optional items selected at zero have zero line totals and do not trigger their positive-purchase minimum. Before payment, show validity, maximum durations, storage/deletion terms and the complete Stars total; distinguish reference UZS amounts from the invoice currency.

## Clear rules before purchase

- Show unit prices alongside the exact payable order total. Telegram digital-service invoices use Stars; a dollar reference is an estimate, not a universal user purchase cost.
- Apply minimum quantities to a selected item. Zero recordings or zero retention extensions remain valid choices. Display quantity increments and any minimum checkout total explicitly.
- Define a practice credit per person rather than implying that a purchase pays for the whole two-person room. Disclose how each participant's allowance is used.
- Preserve existing protections for short calls and failed microphone setup. Any broader replacement-credit policy, qualifying-session threshold or extended-session charging rule needs an explicit business decision.
- Purchasing extra calls must not increase a recording charge or remove existing purchased value. Credit expiry, spend order and top-up validity must be settled before implementing packs; no calendar-month reset is silently carried over from subscriptions.
- State recording eligibility, default retention and deletion dates. A failed recording must not be represented as a delivered purchased recording. Downloads during the purchased retention period should have clearly stated limits, if any.
- Without paid storage, a finite delivery/download window is still required. Its duration and price treatment are undecided; immediate deletion would not be meaningful delivery. Storage period choices and rates in the earlier calculation were a different proposal with included 30-day storage and must be revised before optional storage is priced publicly.
- Show the amount charged, purchased quantities, transaction receipt, remaining usage and applicable terms. Existing refund rules require review for usage packs before those packs are launched; this document does not replace them.

## Terms and acceptance proposal

At first start, present a short readable summary, accessible Terms and Privacy links, and an explicit acceptance button before use. A downloadable PDF can accompany those pages, but must not be the only readable format. Store the accepted document version and timestamp; avoid a preselected checkbox. Provide a clear decline/exit path and keep terms/support reachable before acceptance. Reconfirm materially changed purchase terms before a new purchase, without retroactively reducing paid balances.

Account terms acceptance is separate from both participants' informed permission for an actual recorded session. Acceptance does not authorize arbitrary changes or remove delivery, refund, privacy or platform obligations. Telegram requires accessible terms accepted before purchase and support for legitimate payment disputes. Final terms must match the actual delivered service and applicable law; no binding legal PDF is approved by this planning document.

## Confirmed implementation boundaries

Current prices and entitlements originate in `server/src/services/plan.ts`, with administrator configuration persisted through `server/src/services/planConfiguration.ts`. The public pricing page currently describes Free/Plus/Pro/Boss bundles. Telegram purchase handlers validate those bundle prices and grant subscription entitlements. The deployed Go gateway independently enforces admission, call usage and recording limits.

Consequently, publishing standalone unit offers requires an authoritative catalog plus durable purchase/usage records understood by both Node and Go. Adding a calculator to the landing page alone does not create a working call pack. Subscription counters must not be relabeled as purchased-credit balances.

Implementation sequence:

1. Confirm prices, quantities, duration, expiry and retention terms. Record those values as a versioned catalog, without copying marketing rates into separate frontend constants.
2. Implement server-side quotes and invoices from that catalog. Validate selected items, minimums, increments and integer Stars totals; show the exact total before payment. Preserve an immutable purchase snapshot and payment idempotency.
3. Add durable grants and transactional usage claims for purchased calls/recordings. Coordinate Node and Go admission/completion and recording ownership. Keep legacy subscriptions valid through a documented additive migration.
4. Connect the public unit table/calculator, bot purchase flow and administrator editing to the same catalog. Keep public pages readable without JavaScript and private checkout authenticated.
5. Verify boundary quantities, recording quantity zero, independent call top-ups, concurrent payment/completion replay, recording failures, expiration, retained legacy subscriptions and responsive/keyboard checkout behavior. Exercise actual Stars and recording flows in staging before release.

## Values requiring review before implementation

The calculated proposal supplies initial recommendations for the following values. It does not approve a production catalog or replace existing customer terms.

- Call price in Stars; maximum duration; minimum quantity and purchase increment.
- Recording price; maximum recorded duration; minimum positive quantity; included retention.
- Retention extension choices, prices and scope: individual recordings or a selected group.
- Credit validity and top-up expiry behavior.
- Any volume discounts, replacement-credit rules and pack refund conditions.

Payment reference: [Telegram digital-service payments](https://core.telegram.org/bots/payments-stars). Cost reference: [LiveKit pricing](https://livekit.com/pricing). Prices must be based on actual hosting costs and net proceeds, rather than assuming launch allowances remain free at scale.
