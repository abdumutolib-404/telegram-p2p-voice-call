# Calculated unit-pricing proposal

Calculated on 2026-10-03 at the owner's request. Status: recommendation for review, not an active catalog. No live payment, entitlement, public pricing, refund or crawler file is changed. See [the product specification](unit-pricing.md) for implementation boundaries.

**Later owner clarification on 2026-10-03 supersedes the purchase/expiry presentation below:** no named plans, fixed packs or preset bundles; user-selected quantities with minimums and optional storage. Recommend carry-forward paid call/recording balances without a scheduled expiry, with finite recording retention. The 90-day credit expiry and included 30-day storage below are retained only as the earlier costed scenario, not the latest recommendation. The cost arithmetic remains useful; optional storage needs a defined delivery window and revised rate table before launch. See [the revised specification](unit-pricing.md).

## Recommended initial rates

| Product | Proposed Stars per unit | Minimum positive purchase | Included service |
| --- | ---: | ---: | --- |
| Practice call | 10 | 10 calls (100 Stars) | One person's participation in one qualifying session, up to 30 minutes |
| Recording | 25 | 1 recording | Access to one successfully produced session recording, up to 30 minutes, including 30 days of storage |
| Longer storage | 1 | 1 eligible recording | Extend a selected recording's total storage from 30 to 90 days after creation |

Whole-unit increments, linear totals and no volume discounts initially. Zero recordings and zero storage extensions are valid and free. Calls, recordings and extensions can be purchased independently when eligible. A recording purchase does not buy a practice call. Two participants each use their own call allowance; a call credit is not a payment for both people. A recording credit buys the purchaser's access, not public access or ownership of the other person's speech.

These rates assume a hard maximum of 30 minutes for the purchased service. Longer sessions require a separate, explicitly priced offer; the system must not silently deduct a second credit or advertise a 60- or 90-minute recording at this rate. Existing shorter partner/session limits must be disclosed wherever they can shorten a session. Recorded sessions remain subject to the product's participant consent rules.

Recommended validity: unused call and recording credits last 90 days from their purchase, with no automatic renewal. Each top-up has its own expiry; spending uses the earliest-expiring eligible credits. Buying calls neither renews old credits nor adds recordings. Recording storage starts when the recording is created; the extension must be selected before its current deletion deadline, cannot revive a deleted file, and does not stack beyond 90 total days. Allow downloads during the purchased retention period without a separate per-download purchase. These are proposed terms requiring implementation and review, not current promises.

Keeping one recording as the positive minimum lets a learner record a single mock exam without buying ten recordings. Including 30-day storage keeps routine recording purchases simple. Longer retention remains a small optional charge rather than a second compulsory pack.

## Cost model and evidence

The production provider, actual hosting invoice, bitrate, paid usage, free-user usage and reward withdrawal costs have not been verified. This is a conditional LiveKit Cloud Ship and Cloudflare R2 Standard scenario, not a statement that production uses either paid plan. Self-hosted LiveKit requires a different compute, network and Egress capacity model.

Published inputs checked on 2026-10-03:

| Input | Value and source |
| --- | --- |
| WebRTC usage | Ship: $0.0005 per participant minute after included usage; [LiveKit pricing](https://livekit.com/pricing) |
| Downstream audio data | Ship: $0.12 per GB after included usage; [LiveKit pricing](https://livekit.com/pricing) |
| Mixed audio recording | Ship: $0.005 per minute for audio-only RoomComposite Egress after included usage; [LiveKit pricing](https://livekit.com/pricing) |
| Storage | R2 Standard: $0.015 per GB-month, $4.50/million Class A and $0.36/million Class B requests; direct Internet egress is free; [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Developer reward | $0.013 equivalent per Star before applicable adjustments, taxes or withdrawal costs; [Telegram developer terms, section 6.2.4](https://telegram.org/tos/bot-developers#6-2-4-rewards-for-stars) |
| USD reference | 11,772.95 UZS per USD, record date 03.10.2026; [Central Bank dated USD feed](https://cbu.uz/en/arkhiv-kursov-valyut/json/USD/2026-10-03/) |

The repository uses `startRoomCompositeEgress(..., { audioOnly: true })` in `server/src/config/livekit.ts`; this calculation uses the composite rate, not the cheaper raw-track export rate. The Go gateway also creates audio-only composite recordings.

Assumed audio size: 128,000 bits/second, 30 minutes, decimal GB. One stream/file is `128000 * 1800 / 8 / 1000000000 = 0.0288 GB`, approximately 28.8 MB. Actual encoding, protocol overhead, playback route and storage request counts need measurement.

| Unit | Calculation | Modeled variable cost | Planning budget |
| --- | --- | ---: | ---: |
| Call | `30 * 2 * 0.0005 + 0.0288 * 2 * 0.12` | $0.036912 | $0.05 |
| Recording, incremental to call | `30 * 0.005 + 0.0288 * 0.12 + 0.0288 * 0.015 + (4.50 + 3 * 0.36) / 1000000` | $0.15389358 | $0.18 |
| Extra 60 storage days | `0.0288 * 0.015 * 2` | $0.000864 for storage alone | Covered by the proposed 1-Star charge, subject to service costs |

Call budgeting covers the full two-person room even if the other participant is free, so the recommendation does not depend on collecting two payments. Recording budgeting covers one full Egress job even if only one participant buys recording access. The extra recording data line is a conservative allowance for one audio stream; confirm actual Egress metering. Both planning budgets include headroom above the modeled variable costs, but are not a measured support, refund or tax allowance. Retrieval through a paid proxy can add bandwidth cost. R2 operations and billing-unit rounding are account-level costs; the fractional request allocation above is not an exact invoice.

Included provider usage is deliberately not treated as permanently free marginal supply. The unit budgets use published overage rates to avoid pricing below scaled costs. Adding the full subscription overhead to these rates is a conservative planning bound, not LiveKit's exact invoice calculation: actual invoices apply included usage before overage. Free sessions, failed work, database, monitoring, support, taxes and refunds still require funding.

At 10 Stars, the baseline developer reward is $0.13. With a $0.05 variable budget, a paid call contributes $0.08 toward fixed costs and other expenses. At 25 Stars, a recording yields $0.325 and contributes $0.145 over its $0.18 budget. These are contribution amounts, not net profits.

Telegram's developer terms also specify a 15% Stars-purchase fee while topics in private chats are enabled for the bot. Whether that feature is enabled has not been verified. Under that scenario, reward-equivalent receipts are modeled at $0.1105 per call and $0.27625 per recording; contributions fall to $0.0605 and $0.09625 respectively. Reward availability can be delayed by up to 21 days, so receipts cannot be assumed immediately withdrawable.

Illustrative fixed-cost sensitivity: $50/month LiveKit Ship plus an assumed $20/month backend/database budget gives $70/month. Using the conservative call budget, call-only contribution covers that amount at `ceil(70 / 0.08) = 875` paid call credits/month; with the topics fee, `ceil(70 / 0.0605) = 1158`. This excludes free users, support, refunds, tax and acquisition costs. The $20 is a scenario assumption, not an observed invoice. A low-volume launch may need a subsidy or different hosting; changing unit prices alone does not establish profitability.

## Stars and so'm are different views

The exact charge for these proposed digital-service purchases inside Telegram is Stars (XTR). Customer acquisition cost varies by purchase channel, taxes and fees; [Telegram payment documentation](https://core.telegram.org/bots/payments-stars) does not establish a universal consumer Stars-to-UZS rate.

For the owner's business calculation only, baseline estimated developer reward in UZS is:

`Stars * 0.013 USD/Star * 11772.95 UZS/USD`

| Proposed unit | Exact Stars charge | Estimated developer reward in UZS, rounded |
| --- | ---: | ---: |
| Call | 10 | 1,530 |
| Recording | 25 | 3,826 |
| Storage extension | 1 | 153 |

These UZS figures are estimated receipts before adjustments, not customer prices, guaranteed proceeds, a withdrawal quote or permission to introduce a UZS checkout. Do not place them beside Stars on the public purchase screen as consumer equivalents.

For a future customer-facing UZS estimate, obtain a disclosed consumer acquisition reference `r` in UZS per Star, with its source, channel and date. Then use `quantity * unitStars * r` and sum unrounded line values before final rounding. If no defensible consumer reference exists, show the exact Stars total and explain that Telegram displays the local cost when the customer buys Stars; never fabricate an exact so'm equivalent.

## Worked orders

`Total Stars = 10 * callQuantity + 25 * recordingQuantity + eligibleExtensionQuantity`

| Order | Calls line | Recordings line | Storage line | Exact total | Estimated baseline developer reward in UZS |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 calls, no recordings | 100 | 0 | 0 | 100 Stars | 15,305 |
| 10 calls, 3 recordings with included storage | 100 | 75 | 0 | 175 Stars | 26,783 |
| 30 calls, 5 recordings with included storage | 300 | 125 | 0 | 425 Stars | 65,046 |
| Same order, 90-day storage for all 5 recordings | 300 | 125 | 5 | 430 Stars | 65,811 |

UZS totals are calculated from the unrounded reward basis and rounded once per order, not summed from already-rounded unit estimates. For prepaid recording credits, an extension cannot start counting down at pack purchase: the quote must identify the future storage entitlement or an existing eligible recording and calculate the resulting deletion date. No duplicate Egress charge is assumed for a shared recording file, but each participant's access and credit use must be explicit before launch.

## Review and release boundary

Recommendation: 10 Stars/call, minimum 10; 25 Stars/recording, minimum 1; 30-day storage included; 1 Star/recording to extend to 90 days; unused credits valid for 90 days. Keep presets and the flexible calculator on the same flat rates. Do not advertise an unverified retail UZS conversion. Existing free access and subscription customers retain their current terms until an approved migration.

Before implementing this proposal, review the proposed amounts and terms against actual supplier invoices, measured duration/data, free-user load and payout availability. Then implement the authoritative catalog, independent balances and storage entitlements, immutable payment snapshots, Node/Go enforcement and recording delivery/refund handling described in the product specification. Existing refund rules have not been rewritten, and these draft packs are not available for purchase.
