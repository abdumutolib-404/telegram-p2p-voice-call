# Public practice-pack offers

Updated 16 October 2026. New offers are public channel packs. Random recipient selection and private promotional offer messages are retired. Historical invoices and completed purchases retain their original settlement and refund rules.

## Administrator workflow

Open **Plans → Discount** and enter calls, recordings, retention included/excluded, duration (15 or 30 minutes), discount percentage, participant count and valid period. Every input is required. Recordings cannot exceed calls; retention covers every recording. Discounts range from 0.01% to 100%. Validity ranges from one minute to 47 hours so ordinary cleanup fits Telegram's 48-hour message-deletion window.

The preview uses the saved catalog. The server freezes the pack, catalog revision, prices, discount and deadline. Repeating a submission with the same request ID returns the same campaign. The bot publishes one post in **@pairtalk**, channel `-1004318847810`, with original/discounted totals, remaining/max places and a **Claim offer** Mini App link. No randomizer or offer DM runs.

`discounted total = ceil(original pack total × (100 − discount %) / 100)`

Apply that formula separately to the UZS and Stars totals. A 20% discount means paying 80%. A 100% offer grants its pack without a payment invoice. [Pricing and balances](unit-pricing.md) explains the original pack calculation.

## Inventory and payment

One persistent claim is allowed per campaign and Telegram account. Later campaigns may be claimed separately. Repeated taps resume the current checkout. Unpaid orders temporarily hold inventory for at most 30 minutes or until campaign expiry. User and campaign locks serialize allocation; pending and already-authorized payments count against available places. Settlement consumes the place and grants the pack once. Refunds never reopen a completed campaign claim.

Stars uses the official Telegram invoice. UZS instructions are durably queued to the private bot chat; the Mini App closes after that acknowledgement. A receipt submitted in time requires administrator approval before a balance is granted. An authorized payment remains fulfillable after expiry. Currency switching requires cancellation of an unpaid order; submitted receipts and authorized payments cannot be cancelled through that path.

The post shows paid remaining count plus temporary reservations. After purchases, the reconciler updates counts. At sellout/expiry, new claims stop in the database first, then the bot removes buttons and deletes the post. An old or uneditable post cannot bypass server eligibility. A prolonged outage or revoked permission can require manual cleanup.

## Delivery recovery

Campaign publication uses persistent leases and revision reconciliation. An ambiguous send acknowledgement becomes **UNCONFIRMED**, without an automatic repost. Use **Link existing post** with the existing message ID to recover; activation requires a confirmed edit. Explicitly rejected publication can be retried. Never manually repost an uncertain campaign before resolving its original message.

**Check channel connection** verifies bot channel capability without publishing a test post. Reliable starter-gift membership checks require the bot to be a channel administrator. The once-only three-unit starter gift is a separate membership-gated flow; public campaign checkout does not independently require channel membership.

## Verification and rollout

The October 16 migrations add pack/order snapshots, campaign/claim uniqueness and retire unsent historical offer DMs while preserving authorized purchases. Existing development main triggers deploy the backend and three frontends; no additional site or service is required.

`scripts/check-channel-offers.cjs` accepts only the dedicated loopback verification database. It checks concurrent publication, overselling, repeated claims, free grants, authorized late settlement, uncertain-send recovery, message cleanup, UZS approval races and starter membership grants. Provider responses are synthetic; these checks do not publish to real users or establish live bot permissions.

Telegram constraints: [getChatMember](https://core.telegram.org/bots/api#getchatmember), [deleteMessage](https://core.telegram.org/bots/api#deletemessage), [Mini App direct links](https://core.telegram.org/bots/webapps#direct-link-mini-apps).
