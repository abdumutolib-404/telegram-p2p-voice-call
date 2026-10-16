# Calls and recordings: prices and balances

Updated 16 October 2026 for flexible practice packs. Existing subscription purchases, custom allowances and historical discount purchases retain their original settlement and refund rules. No provider subscription is upgraded by this change.

Customer-facing copy uses calls, recordings and storage, rather than "credits". Internal wallet models and API paths retain their existing names for compatibility.

## Published selling prices

| Service | UZS reference / item | Stars / item |
| --- | --- | --- |
| One participant's call, up to 15 minutes | 3,500 | 18 |
| One mixed recording, up to 15 minutes | 4,200 | 21 |
| Optional 30-day storage, per recording | 3 | Converted in the basket |

For each 15-minute call or recording, `Stars = ceil(UZS / starUzs × 1.25)`. The initial editable `starUzs` reference is 255 UZS, from the owner's 100 Stars = 25,500 UZS purchase reference. A 30-minute service costs exactly twice its rounded 15-minute price: 7,000 UZS / 36 Stars per call and 8,400 UZS / 42 Stars per recording. Local taxes, store prices and purchase methods affect the cost of obtaining Stars.

Ten 15-minute calls and two recordings cost 43,400 UZS or 222 Stars. Adding retention to both costs 43,406 UZS or 223 Stars. Retention converts using the same 255 UZS reference and markup, with one final round-up for the entire retention line. Campaign discounts apply separately to complete original UZS and Stars pack totals.

Admin can edit service prices and the Stars reference separately from expenditure forecasts. Historical saved configurations inherit the new conversion defaults. Existing order snapshots and authorized payment totals remain unchanged.

## Customer offer

- New accounts start at zero, then may claim three call units once after a server check of @pairtalk membership. Reopening, concurrent claims or leaving/rejoining do not grant again. Existing accounts retain balances and are marked already granted.
- Balances use 15-minute units. Select 15 or 30 minutes; the latter reserves two units. Packs require at least one call, recordings cannot exceed calls, and there is no arbitrary quantity ceiling. Safe financial and integer bounds still apply.
- One recording unit covers up to 15 minutes; a 30-minute recording uses two. Existing legacy allowances retain their original limits. Recording needs both partners' agreement.
- Optional storage quantity equals the selected recording quantity. Storage credits automatically apply to the next recordings made with recording credits. Each file’s 30-day clock begins at creation.
- Paid call, recording and storage credits do not expire with a month or a legacy subscription.
- Without storage, files are temporary delivery copies: eligible for cleanup after every owner has a confirmed Telegram receipt, or after the 24-hour recovery window. Telegram may retain a delivered copy independently. Mixed ownership preserves other owners’ storage, while each user’s access deadline is enforced separately.
- The landing, Mini App and bot show separate UZS and Stars totals. Stars uses the official invoice. The owner-selected UZS flow queues private instructions, closes the Mini App and requires verified administrator receipt approval; no pending payment grants balance.
- The customer explicitly accepts the versioned credit purchase terms before checkout. An immutable catalog revision, quantities, totals, terms version and acceptance time are saved with the order.

## Selected costing assumptions — 15 October 2026

The owner selected a $25 total monthly operating budget and 100 paid participant call redemptions. The initial 50-recording forecast was replaced by three recordings to keep the free provider tier: a 60-minute pool covers three 16-minute reservations, including one safety minute per 15-minute recording. These are forecasts, not observed invoices or a demonstrated load maximum.

| Input | Initial value |
| --- | --- |
| Total monthly operating budget | $25 |
| Forecast paid calls / recordings | 100 / 3 |
| Monthly recording pool / reservation per credit | 60 / 16 minutes |
| Participant transport cost reference | $0.0005 / participant minute |
| Mixed audio recording cost reference | $0.005 / recording minute |
| Temporary storage and delivery allowance | $0.001 / recording |
| Optional 30-day storage allowance | $0.000216 / recording |
| UZS / USD costing reference | 11,963.16 |
| Net developer proceeds / Star reference | $0.013 |
| Markup on allocated expenditure | 12% |

Direct forecast call costs are $0.75; direct recording and delivery costs are $0.228. Subtract these from the total budget first, leaving $24.022 in common expenditure, including infrastructure and starter usage. Allocate this remainder equally per forecast paid unit: 100/103 to calls, 3/103 to recordings. This split is an explicit allocation assumption, editable in admin.

`call expenditure = shared budget × call share / paid calls + 15 × participant-minute cost`

`recording expenditure = shared budget × recording share / paid recordings + 15 × recording-minute cost + temporary storage/delivery`

`cost-based estimate = allocated expenditure × 1.12`

Optional retained storage is an additional purchase and is costed separately. At an assumed 128 kbps, a 15-minute file is about 14.4 MB; at $0.015/GB-month this is $0.000216 of Standard storage. Operations, retries and temporary storage are covered by the delivery allowance and common budget; update the inputs if measurements differ.

| Service | Allocated expenditure (USD) | Cost + 12% estimate (UZS reference) |
| --- | --- | --- |
| 15-minute call | $0.240724 | 3,225.40 |
| 15-minute recording | $0.309222 | 4,143.19 |
| 30-day storage per recording | $0.000216 | 2.90 |

Cost estimates are calculated in millionths of a USD, rounded upwards at that precision. The 12% cost markup is retained as an admin benchmark, separately from the owner's fixed selling prices above. Actual profitability depends on costs, payment proceeds and redemption volumes.

The expenditure allocation is a costing benchmark, separate from selling prices. Current default service Stars are derived from the editable 255 UZS reference: one call is 18 Stars, ten calls are 180 Stars, and one recording is 21 Stars. Stars developer proceeds do not equal the customer's store purchase price.

Admin can edit every cost/forecast input and pause new sales. Saved changes are audited and update new quotes across all interfaces. Existing orders keep their original quote for their 30-minute checkout window; an authorized payment is honoured even when prices or sales availability change before its success notification arrives.

## Durable consumption and refunds

- Node and Go share the same PostgreSQL reservation/release functions, wallet counters, credit usage records and participant lock order.
- Existing included allowances retain their limits. A selected 30-minute wallet call reserves two units before any 15-minute bonus; 15-minute calls can use the applicable included/bonus allowance. Reservations occur inside locked admission, so concurrent attempts cannot spend the same balance.
- Completion settles a call reservation once. Failed connections, cancelled invitations and calls shorter than five authorized seconds restore it. Reconnects reuse the existing session and reservation.
- Recording/storage reservations are made once per participant and call. A usable exported file consumes them; terminal failed exports restore them. The post-call worker reconciles missing provider notifications.
- New credit purchases support a full automatic Stars refund within 48 hours if all purchased quantities remain available and unreserved. Refund initiation removes those quantities transactionally before contacting Telegram. Uncertain confirmation remains pending; retries and background recovery use the same original payment.
- Credit purchases appear in Mini App purchase history, the admin purchase table and Stars revenue totals. UZS references are not counted as card receipts.
- Legacy subscription refunds retain their original policy and remain accessible separately through `/refund`.

## Provider and launch limits

No paid provider tier was selected or upgraded by this change. Current account tiers and actual bills must be checked operationally. Credit failure handling does not create extra LiveKit capacity.

Recording sales are capped transactionally against the UTC monthly pool. Existing wallet credits, pending invoice holds, tracked recordings and older recording sessions reduce available stock. Concurrent checkouts cannot buy the same remaining reservation. Expired, unauthorized invoices release their holds; authorized payments keep capacity reserved until settlement. Existing non-expiring recording wallets carry their capacity obligation forward into the next month.

Both voice backends reserve recording capacity before contacting the media provider. Legacy recordings use the same pool. A failed export returns wallet credits but conservatively retains its provider-capacity reservation because an attempted recording may have consumed provider minutes. Capacity is estimated from this app's records, not read from provider billing. Admin must reserve minutes for other or untracked project usage through the external-usage input. Keep that reservation conservative; the safety buffer is not a guarantee about the provider's accounting. No recording stock leaves call-only checkout available.

The earlier free-launch operating recommendation remains 50–80 fully active starters, with three 15-minute calls each, and an initial target of ten simultaneous two-person calls. These are planning recommendations, not enforced admission caps or a demonstrated load-test maximum. At full redemption, 80 starters consume 3,600 participant minutes before other usage. Free mixed-recording minutes are a project-wide pool, not a per-user allowance.

Reference sources researched on 15 October 2026:

- [Railway](https://railway.com/pricing): Hobby $5/month including $5 resource use; Pro $20 including $20. One shared workspace minimum, not a fee per backend/database/Redis service. The selected $25 budget already covers planned common infrastructure costs.
- [LiveKit pricing](https://livekit.com/pricing) and [quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/): Build includes 5,000 participant minutes and 60 composite recording minutes with hard caps. Ship starts at $50/month; its audio-only composite and participant overage references inform the editable direct-cost inputs. Included usage must not be billed again as an additional fixed expense.
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/): existing frontends use Workers Static Assets. Static delivery is free; dynamic Worker allowances are shared at account level. Paid Workers are optional and were not enabled.
- [R2 Standard](https://developers.cloudflare.com/r2/pricing/): 10 GB-month, 1M Class A and 10M Class B operations are included at account level; additional Standard storage is $0.015/GB-month. Free allowances can lower actual costs; non-expiring credits also create future delivery obligations.
- [Haiku pricing](https://platform.claude.com/docs/en/about-claude/pricing): AI/API expenditure belongs in the common budget when actually incurred. Existing question curation uses Gemini/heuristics; this change does not add Haiku, transcription, an AI voice agent or a per-call AI fee.
- [CBU USD reference](https://cbu.uz/en/arkhiv-kursov-valyut/json/USD/) and [Telegram Stars developer rewards](https://telegram.org/tos/bot-developers#6-2-4-rewards-for-stars).

## Verification

Run the backend and frontend suites and builds. `scripts/check-credit-pricing.cjs` accepts only the dedicated loopback PostgreSQL test database, exercises real transactions with synthetic provider acknowledgements, and removes its fixtures. Go integration tests cover the same shared wallet contract. Provider payment/media acknowledgements in these checks are synthetic, not evidence of a live purchase or recording.
