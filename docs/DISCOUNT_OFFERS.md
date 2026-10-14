# Exclusive discount campaigns

In the admin panel, open **Plans and limits → Discount**. All four fields are required:

- **Plan:** an active Plus, Pro or Boss plan with positive published prices.
- **Discount (%):** 0.01–100%, with up to two decimal places.
- **Number of users:** 1–10,000 eligible recipients. If fewer are available, creation fails without a partial campaign.
- **Limited offer:** a positive period in minutes, hours or days, up to 365 days. The claim deadline begins when the campaign is created; it is separate from the plan's subscription validity.

The preview uses saved plan prices. Creating a discount does not change public prices or publish any unsaved plan edits. The server stores the campaign's prices, plan configuration, quoted subscription validity and absolute UTC deadline. A repeated submission with the same request ID returns the same campaign rather than drawing recipients again. After successful creation the form requires **New campaign** before another execution.

## Recipients and messages

The server uses a cryptographic random sample without replacement. A database constraint permits one offer per user per campaign. Later campaigns can select that user again when eligible.

Eligibility follows existing purchase rules: completed registration/current consent, no suspension, no active subscription at the same or higher tier, and no pending card request or unexpired offer payment authorization. Selection is checked again when claiming. An expired unanswered Stars authorization cannot block future campaigns indefinitely.

Each selected offer schedules one personal Telegram message with the plan, discount, original/reduced Stars and UZS prices, expiry and **Claim Offer** button. Delivery uses the existing durable notification queue, a unique offer deduplication key and a deadline. Queue pressure delays scheduling without redrawing recipients. Expired queued notices are skipped. Uncertain send outcomes are not blindly replayed. Creation confirms selection/scheduling, not guaranteed provider delivery.

The same personal offer appears on dashboard Practice, Account and Upgrade with both prices, subscription validity and a countdown based on server time. Claimed offers disappear on refresh; expired offers disappear locally at the deadline. Existing Telegram messages remain readable, but their expired buttons and invoices cannot begin a purchase. Forwarding a message does not transfer ownership.

## Prices and claiming

Each price is calculated independently:

`discounted price = ceil(original price × (100 − discount percentage) / 100)`

For 20% off: **100 Stars → 80 Stars**, and **10,000 UZS → 8,000 UZS**. Whole units round up; for example, 79 Stars at 20% off costs 64 Stars. No currency conversion is used. A 100% offer activates the plan once without an invoice or card transfer.

Stars checkout binds the stored amount and order to the recipient. Only one distinct pre-checkout query can authorize an offer. Repeated clicks reuse an unsubmitted order, and changing payment methods invalidates the older invoice. Authorization after expiry is rejected. A payment authorized before the deadline can settle afterward. The confirmed charge and entitlement are committed together; duplicate updates do not activate twice. A distinct unexpected or incompatible settled charge enters the existing refund workflow rather than granting again.

UZS uses the existing card-transfer/receipt-review workflow. The amount on the instructions, stored request and admin notification is the campaign's discounted UZS price. A receipt must be submitted before expiry. The request and offer reservation are committed together. Administrators may review an in-time request after expiry, using the original subscription validity. Duplicate approval cannot consume the offer twice. Rejection or cancellation releases an unused offer while its original deadline still applies. A completed claim stays consumed even after a refund.

Discount activation does not introduce special recording/retention overrides or a different mixed-plan call restriction. Standard plan defaults still apply, alongside the quoted subscription validity.

A newer 100% grant is entitlement evidence even though it has no payment transaction. Refunding an older same-tier Stars or card purchase preserves that grant. Refunding the discounted paid purchase itself still applies normal revocation rules and leaves its offer consumed.

## Deployment and verification

Migration `202610140001_discount_offers` adds campaign/recipient tables, optional payment links and notification expiry. It is additive: existing purchases, plans and notices remain compatible. Deploy the backend and admin/client builds through the existing `origin/main` development triggers; no additional service or site is needed. The dedicated notification-scheduling worker drains on shutdown independently of call recovery.

Verification covers pricing, mandatory inputs, random selection, campaign replay, ownership, notification deduplication/expiry, repeated and concurrent claims, Stars authorization/settlement/refunds, card receipts/approval/cancellation, later campaigns and worker shutdown. The separate owned PostgreSQL probe exercises real transactions and locks with synthetic recipients/payments. Browser verification uses actual admin/dashboard components with blocked external requests, including short mobile layouts, both themes and submission retry. No campaign, charge or promotional message is executed against real users as part of these tests.

Telegram Stars API behavior was checked against the [official payment documentation](https://core.telegram.org/bots/payments-stars). Deployment revisions and final verification counts are retained separately in the ignored local verification output.

Final local verification on October 14: **87 backend files / 915 tests**, **19 client files / 121 tests**, backend production build, client/admin lint and production builds, and **30 browser checks** passed. The backend's 48 focused discount/order checks are included in the full suite. Actual PostgreSQL passed campaign replay/deduplication, concurrent Stars authorization and settlement, duplicate/extra receipts, concurrent 100% claims, discounted UZS submission/approval, expiry, original subscription validity and preservation of newer free grants across older refunds. All ten migrations are applied to the owned verification database with no schema drift. Synthetic fixtures were cleaned and that local database was stopped afterward. The admin linter retains its existing Fast Refresh export warning; it reports no new lint errors.
