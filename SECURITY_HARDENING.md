# Security Hardening Applied — 2026-08-12

## Fixed

- Telegram WebApp `initData` validation now uses strict key ordering and `crypto.timingSafeEqual` for HMAC comparison.
- Telegram user IDs remain `bigint` or decimal strings at persistence/API boundaries; backend code no longer coerces Telegram IDs to JavaScript `number`.
- Removed the global `BigInt.prototype.toJSON` mutation.
- Redis matchmaking now uses an atomic Lua claim operation rather than a non-atomic `SPOP` + validation sequence.
- Matchmaking has Redis-backed per-user locks and explicit queue restoration on failed match setup.
- Production no longer silently falls back from PostgreSQL/Redis to process-local mocks.
- Daily call quota reservation is transactional and uses conditional atomic increments.
- Failed call setup rolls back the newly-created call session and reserved quota before re-queueing participants.
- Socket queue cancellation is performed only after the disconnected socket is removed; another live socket keeps the user queued.
- `finish_call` is idempotent via a conditional `ACTIVE` -> `COMPLETED` transition.
- Recording start/stop is serialized per room, authorized against call participants, and protects against duplicate egress creation.
- Recording paths use canonical `path.relative` containment checks.
- CORS uses exact origin matching instead of prefix matching.
- Admin 2FA token consumption is atomic in Redis and production fails closed if Redis is unavailable.
- Admin JWT verification validates both role and decimal Telegram ID shape.
- Admin login uses constant-time master-password comparison.
- Removed stale `.refactored.ts` duplicates from the server source tree.
- Production source no longer declares explicit `any` types.

## Verification

- TypeScript source parsing/transpilation check: passed for all production `.ts` files (`syntax_errors=0`).
- Full `tsc --noEmit` could not complete because the extracted environment does not contain the installed project dependency typings (`@types/*`, package modules).
- `npm ci` was attempted but dependency installation timed out in the provided environment.
- Runtime integration tests were therefore not claimed as passing.

## Recommended CI gate

```bash
npm ci
npx prisma generate
npx tsc --noEmit
npm test -- --runInBand
npm run build
```
