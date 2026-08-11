# Explorer 3 Handoff Report: Backend Core Services & REST/Socket APIs

## 1. Observation
- Inspected `D:\telegram-p2p-voice-call\server`: currently contains `package.json`, `package-lock.json`, `tsconfig.json`, `.env`, and `node_modules/`.
- The source directory `server/src/` **does not exist yet**.
- `server/package.json` includes `express`, `socket.io`, `grammy`, `cors`, `dotenv`.
- Packages missing for full core functionality: `ioredis`, `livekit-server-sdk`, `@prisma/client` / `prisma`, `jsonwebtoken`, `node-cron`, `bcrypt`.
- Full analysis report written to `D:\telegram-p2p-voice-call\.agents\explorer_m1_3\analysis.md`.

## 2. Logic Chain
- **$O(1)$ Redis Bucket Queue**: Bucket schema `match_queue:<band>:<weak>:<strong_skill>`. Complementary lookup uses `SPOP` on `match_queue:<band>:<strong_skill_A>:<weak_skill_A>`. If empty, `SADD` to user's bucket and set `user_queue:<userId>`. Cancellation does `SREM` and `DEL` in $O(1)$ time.
- **LiveKit SFU & Dual-Voice Egress**: Token issued via `AccessToken` claims. Egress recording uses `EgressClient.startRoomCompositeEgress(...)`. Headphone support achieved via media bridge level audio track composite mixing.
- **Daily Storage Cleanup Cron**: Scheduled via `node-cron` daily at `00:00 UTC`. Enforces retention rules (Free: 1 day, Plus: 7 days, Pro: 30 days) by querying expired `Recording` records, deleting files from disk, and purging DB records.
- **Moderation Penalty Ladder**: Report 1 -> Warning alert (`WARNED`), Report 2 -> 6-hour temporary ban (`TEMP_BANNED`, `bannedUntil`), Report 3 -> Permanent lock (`PERM_BANNED`, `isPermanentlyBanned`).
- **Mixed-Plan Duration Rule**: $\max(limit_A, limit_B)$ calculated upon room creation and sent in `match_found` event.
- **Telegram WebApp initData HMAC Lockdown**: Middleware checks `X-Telegram-Init-Data` header against `BOT_TOKEN` HMAC signature. Rejects invalid requests with HTTP `403 Forbidden`.
- **Stealth /admin & REST APIs**: 1-time Redis token generated on `/admin` command for authorized Telegram IDs. Exchange token + master password at `POST /api/admin/login` for 24h JWT. Admin endpoints (`/stats`, `/plans`, `/appeals`) protected by `requireAdminAuth` JWT middleware.

## 3. Caveats
- `server/package.json` must be updated with missing npm packages (`ioredis`, `livekit-server-sdk`, `@prisma/client`, `prisma`, `jsonwebtoken`, `node-cron`, `bcrypt`).
- LiveKit SFU server configuration environment variables (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) are required for live Egress testing.
- Prisma schema file (`prisma/schema.prisma`) needs to be generated and migrated for SQLite DB storage.

## 4. Conclusion
Backend core service requirements and API contracts are fully analyzed and ready for implementation. The specified architecture guarantees $O(1)$ matchmaking, server-side audio egress with headphone isolation, automated tier retention cleanup, scaled moderation, HMAC WebApp lockdown security, and stealth admin endpoints.

Recommended file structure for implementer:
`server/src/index.ts`, `server/src/config/` (env, db, redis, livekit), `server/src/middleware/` (telegramAuth, adminAuth), `server/src/services/` (matchmaking, livekit, storage, moderation, plan, analytics), `server/src/routes/` (admin, call, user), `server/src/socket/` (socketHandler).

## 5. Verification Method
- Execute `npm run build` (`tsc`) in `server/` to verify zero TypeScript compilation errors after implementation.
- Run unit/integration tests covering Redis bucket operations, HMAC validation, moderation ladder state changes, plan max limit calculations, and storage cleanup query logic.
