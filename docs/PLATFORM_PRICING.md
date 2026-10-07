# Shared pricing and comparison

Updated 2026-10-07. PairTalk's landing, client, admin and Telegram bot use the same published plan configuration. The existing Free/Plus/Pro/Boss subscription model remains in force; this change does not introduce lifetime credits, new prices, currency conversion or unit purchases.

## Publication flow

1. An authenticated administrator saves the plan editor. Its existing validation and audit record persist the configuration.
2. `GET /api/public/plans` loads that persisted configuration and exposes only active offers, their public allowances and exact Stars/UZS prices. A revision hash identifies the configuration and `checkedAt` dates the response. Internal audit identities and provider credentials are excluded.
3. The public `/pricing` comparison, client plan chooser and admin published preview use `platform/usePricing.ts`. They refresh every 30 seconds while visible and on focus. Requests are bounded to eight seconds, deduplicated and cancelled when a view closes. A failed or invalid response removes quoted offers and displays a retry action. No fabricated or stale checkout price substitutes for a failed response.
4. Telegram plan menus reload the same configuration before quoting prices. Existing server invoice and entitlement checks remain authoritative.

The public schema and comparison functions live in `server/src/contracts/pricing.ts`. Frontends import only that pure contract module, not server configuration, database clients or secrets. Frontend build contexts must include the repository's `platform/` and `server/src/contracts/` directories. The Docker build copies both.

## Public comparison

The needs selector compares desired calls, minutes per call, recordings and retention against published allowances. It recommends the least expensive matching active plan in the selected payment currency. Selecting zero recordings makes retention irrelevant. Stars and UZS are independent quoted prices; no exchange rate is inferred.

Average cost per included call divides the whole bundle price by its included calls. It is explicitly an estimate for comparison, not a separately sold call or a guarantee that every credit will be used. Unlimited and zero-call offers have no finite per-call estimate. Free allowances use calendar months; paid allowances use their configured subscription duration. Purchased allowances and unused-credit expiry continue to follow the current subscription rules. An account may have individual allowances, so the private dashboard displays its authenticated server snapshot rather than substituting public offers.

The client sends selected paid plans to the actual Telegram bot with an upgrade payload. Registration remains in Telegram. Public comparison access does not grant dashboard or admin access; their existing authentication boundaries are preserved.

## Build settings and search

- Landing: set `VITE_PUBLIC_PRICING_URL` to the backend's `/api/public/plans` HTTPS URL.
- Client: `VITE_SERVER_URL` supplies that same backend origin; `VITE_PUBLIC_SITE_URL` supplies the public comparison link.
- Admin: `VITE_API_URL` supplies that same backend origin; `VITE_PUBLIC_SITE_URL` supplies the public comparison link.
- Backend: optional `BOT_USERNAME` supplies a public checkout username before startup; successful bot initialization replaces it with Telegram's verified username. It contains no token.

The existing `/pricing` route has updated comparison metadata and accessible content. Setting `PUBLIC_PRICING_BUILD_URL` in the landing build environment adds a validated, dated catalog snapshot to its pre-rendered HTML for crawlers. The browser validates this snapshot and immediately refreshes it against the live endpoint. Without a successful build snapshot, pre-rendered HTML explains the comparison and the browser loads current offers. A saved snapshot is dated build output, not a perpetual current-price claim; rebuild when published offers change if crawler-visible prices must reflect them immediately.

The October 7 SEO review updates `robots.txt`, `sitemap.xml`, and `llms` documents to describe the current platform. Builds preserve those reviewed source files. Pricing and statistics Markdown exports are generated from public page content and identify quoted figures as dated snapshots. No ranking guarantee or fabricated reviews/statistics are added.

## Verification

Server tests cover authenticated admin publication followed by a changed public catalog and Telegram quote, active-offer filtering, the public allowlist, failure handling, protected publication, and recommendation arithmetic. Browser component tests cover both interfaces consuming the same catalog, live refresh, stale-price removal, request timeout/cancellation and currency-specific recommendations. Production builds include the shared modules without server secrets.
