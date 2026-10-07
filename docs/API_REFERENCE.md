# HTTP API reference

Reviewed 2026-10-05. Route handlers are authoritative for payload validation and response details. Paths below are relative to the public gateway origin.

## Authentication

Mini App protected routes use signed Telegram launch data in `X-Telegram-Init-Data`. `POST /api/auth/verify` validates launch identity and returns the application's account/entitlement state. Do not treat client user IDs as authorization.

Admin access uses password plus Telegram OTP and the credentials handled by [adminAuth.ts](../server/src/middleware/adminAuth.ts). Use the shipped admin API client for cookie/token handling; never place admin credentials in public frontend configuration. Redis-backed OTP challenges cannot fall back to stale replica memory.

## Public and Mini App routes

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /health | Node persistence readiness |
| GET | /healthz | Gateway readiness |
| POST | /api/auth/verify | Signed launch verification |
| GET | /api/auth/bot-info | Public bot information |
| GET | /api/public/stats | Aggregate public statistics; no account/recording identifiers |
| GET | /api/public/plans | Active public offers, exact Stars/UZS prices, allowances, revision and check time; no authentication |
| GET | /api/ielts/topics | Question-topic catalog |
| GET | /api/ielts/questions | Filtered questions |
| GET | /api/ielts/questions/export | Question export; CSV formula-neutralized |
| GET | /api/calls/active | Authenticated active session recovery, optional active_call/sessionId query |
| GET | /api/calls/recording/:sessionId | Authenticated latest recording retrieval |
| GET | /api/calls/:sessionId/recording | Equivalent recording retrieval alias |
| POST | /api/livekit/webhook | Provider-signed raw-body webhook |

Sources: [auth.ts](../server/src/routes/auth.ts), [publicStats.ts](../server/src/routes/publicStats.ts), [ielts.ts](../server/src/routes/ielts.ts), [calls.ts](../server/src/routes/calls.ts), [livekitWebhook.ts](../server/src/routes/livekitWebhook.ts).

Recording retrieval checks participant identity, saved owner access, session expiry, and requester retention before object lookup. S3 delivery returns a temporary signed URL (JSON when `format=json` or JSON is requested, otherwise redirect). Local delivery streams the file within the configured recording root. It is not a public bucket URL or a historical-segment listing.

Public question filters accept a single topic UUID/slug and `PART_1`, `PART_2`, `PART_3`, or `all` (parts are case-insensitive). Invalid or repeated/object parameters return 400. Question pages default to 30 items and page 1; supported limits are 1–50 and pages 1–10000. Only unfiltered-topic requests for the first ten pages use the bounded shared cache.

Public JSON/CSV exports return the complete matching dataset up to 1000 rows. Larger exports return 413 with instructions to select a narrower topic or part; results are never silently truncated. Each backend permits two simultaneous exports, with an additional per-IP budget of three exports per minute. Public question routes have a per-IP budget of 60 reads per minute and a shared concurrency limit of 16. Busy/rate-limited requests return 429. Admin exports retain their separate authenticated contract.

Stats failures return an unavailable response rather than fabricated totals. Ratings require the minimum sample described by the handler. Read [landing presentation](../landing/src/components/StatsPage.tsx) before making marketing claims from aggregates.

## Admin routes

All routes below use the `/api/admin` prefix. Authentication endpoints begin the login process; business endpoints require admin authorization.

| Methods | Path |
| --- | --- |
| POST | /auth/password, /auth/otp, /auth/logout |
| POST | /login (legacy login contract) |
| GET | /stats, /plans, /plans/purchasable |
| PUT | /plans |
| GET | /users |
| PATCH | /users/:id/plan |
| POST | /users/:id/ban, /users/:id/moderate |
| GET | /payments/manual, /payments/manual/:id/receipt |
| POST | /payments/manual/:id/approve, /reject, /refund, /reject-refund |
| GET | /payments/stars |
| POST | /payments/stars/:id/refund |
| GET | /audit-logs, /appeals |
| POST | /appeals/:id/approve, /appeals/:id/reject |
| GET / POST | /contest |
| POST | /contest/conclude, /contest/toggle |
| GET | /telemetry/health, /telemetry/queue, /telemetry/active-calls, /telemetry/errors |
| GET / POST | /ielts/topics, /ielts/questions |
| PATCH / DELETE | /ielts/topics/:id, /ielts/questions/:id |
| GET | /ielts/questions/export |
| POST | /ielts/questions/bulk |
| GET | /ielts/crawler/status, /ielts/crawler/logs |
| POST | /ielts/crawler/gemini-check, /ielts/crawler/run, /ielts/crawler/filter-run |

In the abbreviated manual-payment row, each action is appended to `/payments/manual/:id`. Source contracts are [admin.ts](../server/src/routes/admin.ts), [adminIelts.ts](../server/src/routes/adminIelts.ts), and [adminTelemetry.ts](../server/src/routes/adminTelemetry.ts).

Mutation requests must preserve their failure result; do not automatically retry an ambiguous payment or moderation operation. Refund processing may be pending, failed, or provider-confirmed. Current plan updates validate supported fields and bounds, retain omitted values, and persist an audit record.

## Routing and errors

Public HTML, API JSON, and app shells have distinct routing behavior. Unknown public pages return a true 404. Errors vary by route; consumers should use the existing clients and canonical contracts rather than assuming every error has one shape. Request identifiers support diagnosis without putting credentials in logs.

For event contracts, use [Signaling](WEBSOCKET_EVENTS.md). For schema fields, use [State and storage](STATE_AND_STORAGE.md).
