# Bot registration and private dashboard

The bot handles registration, Terms of Use consent, payments, refunds, billing support and permanent-ban appeals. Its main card has Open dashboard, Payments and Support. The Telegram menu opens the signed Mini App. The advertised commands are `/start`, `/terms`, `/plans`, `/refund`, `/paysupport` and `/appeal`; administrator commands remain private.

Calls, recordings, call-quality ratings, safety reports, saved partners, invitations, referral information, the active contest and speaking-profile preferences live in the responsive client dashboard. Older bot buttons route to the corresponding dashboard view. Post-call notifications link to the particular conversation. Ratings and reports are independent; each is recorded once per participant and conversation. Reports retain the existing moderation ladder.

## Registration agreement

1. `/start` sends the PDF before score selection. An existing account without current consent also receives it.
2. The user chooses Agree and continue or Decline. Declining stops that registration attempt. A failed PDF upload does not offer valid consent.
3. Acceptance stores the document version, SHA-256 and timestamp on the account and a durable `TermsAcceptance` record. Callback acceptance is bound to the document message and current bot session. A replay, stale version or incorrect hash is rejected.
4. New users finish score selection in the bot before the dashboard becomes available. Call recording still requires its own agreement; registration consent never turns recording on.

The PDF is exported from the terms and relevant privacy sections in `landing/src/content.tsx`, using the implemented refund eligibility rule of within 48 hours OR below 10% usage. Public and client policy copy use the same rule. It also clarifies that Telegram's own higher account age requirements apply where relevant. The exporter requires review if the website wording changes. This change does not introduce the previously discussed lifetime-credit pricing; current purchased plan validity remains. Version 2026-10-08 replaces the fixed 30-day promise with the validity shown for the purchased offer. Prior accepted documents remain archived under server/assets/terms/. Existing users must accept the updated document before private access resumes.

To publish a new version, review the website policies, update `VERSION` in `scripts/build_terms_pdf.py`, and run the exporter with Python, ReportLab and pypdf. Review all rendered pages. Commit `server/assets/pairtalk-terms-of-use.pdf`, `server/assets/terms-manifest.json` and the generated `gateway/internal/auth/terms.go` together. The exporter also writes the downloadable review copy to `output/pdf/`. Server builds copy and verify the assets; missing or mismatched terms fail rather than silently skipping the agreement.

## Private access

An ordinary browser visit redirects to `VITE_PUBLIC_SITE_URL` (default `https://pairtalk.online`). The client verifies Telegram launch data before rendering private views. Unsupported launches inside Telegram show how to reopen the Mini App. Forged or expired signatures redirect to the public site. Registration and terms errors explain how to continue in the bot; moderation restrictions preserve recovery instructions.

Set the client build's `VITE_BOT_USERNAME` to the actual public BotFather username, without `@`, so registration, referral and payment links open the correct bot. `VITE_SERVER_URL` selects the backend origin; `VITE_PUBLIC_SITE_URL` selects the public landing redirect.

Every dashboard request requires server-validated Telegram HMAC data, a completed bot registration, current document acceptance and an unrestricted account. Session actions require participant ownership. Responses exclude partners' Telegram identifiers and private storage URLs. The Node socket server and Go gateway enforce registration and terms as well. A depleted call allowance does not prevent access to history, account settings or billing; call admission still checks allowance under participant locks.

Client-side platform checks are navigation behavior. The security boundary is the signed, time-limited Telegram credential and server authorization; static client assets are public. Telegram credentials must stay out of recording URLs and logs. New private APIs send `Cache-Control: no-store`.

## Deployment

Run `npm run db:deploy` from `server/` before starting the new server or gateway. The additive migration creates the acceptance audit table and nullable account fields. It does not assume existing users have agreed; those users must use `/start` once. Deploy the server, client and gateway from the same release. Bot startup refreshes the command list and signed Mini App menu when it becomes the polling owner. Financial settlement callbacks and billing support remain available independently of renewed consent.

Use the existing isolated verification scripts with synthetic credentials. Never start polling with production credentials as a local UI test. The existing UI gallery is separate from application authentication and uses sample data.
