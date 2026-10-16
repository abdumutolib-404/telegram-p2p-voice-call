# Shared pricing and comparison

Updated 16 October 2026. Flexible practice packs are the default new purchase flow. Existing Free/Plus/Pro/Boss subscription benefits and historical purchases remain supported under their original terms.

## Publication and quotation

Administrators save service selling prices, costing assumptions, the UZS-per-Star reference and sales/capacity controls through the existing authenticated editor. Updates are validated, audited and serialized. `GET /api/public/plans` publishes credential-free `credits` compatibility data and the version-two `packs` catalog with a revision and check time.

Landing, Mini App and admin import only pure shared contracts from `server/src/contracts/`; no server credentials or database code enter browser bundles. Build contexts must include `platform/` and those contracts. Cloudflare builds run in each frontend's configured directory within the complete checkout. The backend image builds Node and Go separately.

The builder accepts 15/30-minute packs, calls, recordings and optional retention. Recordings must not exceed calls; retention quantity equals recordings. There is no arbitrary business quantity cap, while safe integer/payment/wallet bounds remain enforced. Server quotation is authoritative. Checkout snapshots bind the account, selection, duration, catalog revision, terms, request identity and currency. Replays cannot change those attributes. [Pricing and balances](unit-pricing.md) contains the formulas and duration-unit explanation.

**Buy credits → Checkout** opens a review dialog with separate UZS and Stars totals. Stars opens Telegram's official invoice. The owner-selected UZS option queues private manual-payment instructions, closes the Mini App and requires receipt approval. This UZS flow retains the acknowledged Telegram digital-payment policy conflict. An owned pending order can be resumed with its original currency and prices; unpaid cancellation releases its hold. Already-authorized totals survive later configuration changes.

`platform/usePricing.ts` refreshes while visible and on focus, validates responses, bounds request duration and cancels closed views. Failed/invalid live data clears current quotations and exposes retry. Persisted order snapshots are distinct from a current public quote.

## Public comparison

One table compares PairTalk, self-organized communities and tutors across matchmaking, level fit, scheduling, prompts, starter practice and the cost of ten 15-minute sessions. PairTalk uses the published call price. The tutoring example is a dated, attributed teaching-time estimate; communities have variable rules and availability. Peer practice and professional teaching are described accurately. Starter practice requires a once-only server membership check in @pairtalk.

## Build and runtime settings

- Landing proxies only `/api/public/plans` and `/api/public/stats` through its existing Worker to `PUBLIC_API_ORIGIN`. Optional `VITE_PUBLIC_PRICING_URL` and `VITE_PUBLIC_STATS_URL` override browser URLs.
- Client uses `VITE_SERVER_URL` and `VITE_PUBLIC_SITE_URL`; admin uses `VITE_API_URL` and `VITE_PUBLIC_SITE_URL`.
- Backend's public bot username comes from configuration until Telegram initialization verifies it. It contains no token.
- Optional `PUBLIC_PRICING_BUILD_URL` provides a validated, dated prerender snapshot. The browser refreshes it live. Without it, prerendered content explains the builder without inventing a quotation.

## Verification

Shared-contract tests cover whole-number rounding, duration doubling, discounts, capacity, quantity relationships and invalid/injected input. Owned PostgreSQL checks exercise immutable snapshots, replay and approval races, exact unit reservations/refunds and wallet headroom. Browser checks cover both currencies with synthetic provider actions, mobile layouts, themes, keyboard focus and accessibility. They do not prove an actual external payment or live provider entitlement.
