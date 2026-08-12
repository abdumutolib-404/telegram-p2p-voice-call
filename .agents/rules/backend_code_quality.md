# Rule: Backend Code Quality, Security & Concurrency Standard

Whenever generating or refactoring TypeScript code in the `server/` directory:

1. **Strict Type Safety**:
   - Zero `: any` or `as any` casting. Use explicit interfaces or generics (`Record<string, unknown>`, `unknown`).
   - Safely convert `BigInt` (Telegram IDs) to string before API JSON delivery.

2. **Cryptographic Integrity**:
   - All Telegram `initData` validation MUST sort parameter pairs alphabetically (`key=value`), derive HMAC secret using `WebAppData`, and compare hash digests using `crypto.timingSafeEqual` with buffer length validation.
   - Enforce strict freshness limits on authentication signatures.

3. **Concurrency & Resource Management**:
   - Always group multi-table updates into `prisma.$transaction()`.
   - Ensure WebSocket disconnect handlers release all allocated WebRTC audio egress sessions and clear state maps.

4. **Error Handling**:
   - Catch blocks MUST use `err: unknown` and narrow types safely.
   - Never suppress asynchronous errors silently without structured logging.
