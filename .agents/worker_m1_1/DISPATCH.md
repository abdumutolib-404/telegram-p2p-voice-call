# Worker 1 Dispatch — Backend Core Engine Implementation (M1)

**Working Directory**: D:\telegram-p2p-voice-call\.agents\worker_m1_1
**Target Workspace**: D:\telegram-p2p-voice-call\server
**Original Request**: D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md
**Project Index**: D:\telegram-p2p-voice-call\PROJECT.md
**Scope Document**: D:\telegram-p2p-voice-call\.agents\sub_orch_backend\SCOPE.md

**Explorer Input Reports**:
- Explorer 1 Analysis: D:\telegram-p2p-voice-call\.agents\explorer_m1_1\analysis.md
- Explorer 2 Analysis: D:\telegram-p2p-voice-call\.agents\explorer_m1_2\analysis.md
- Explorer 3 Analysis: D:\telegram-p2p-voice-call\.agents\explorer_m1_3\analysis.md

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Objectives
1. Read ORIGINAL_REQUEST.md, PROJECT.md, SCOPE.md, and all Explorer analysis reports.
2. Update `server/package.json` with all required dependencies:
   - `@prisma/client`, `prisma`, `ioredis`, `livekit-server-sdk`, `jsonwebtoken`, `node-cron`, `uuid`, `grammy`, `express`, `socket.io`, `cors`, `dotenv`, `@types/...`, `vitest` or `jest`.
3. Set up Prisma SQLite database in `server/prisma/schema.prisma` with models:
   - `User` (telegramId, alias, subFC, subLR, subGRA, subP, band, plan, maxDuration, dailyLimit, isBanned, bannedUntil, isPermanentlyBanned, dnd, createdAt)
   - `CallSession` (id, roomName, userAId, userBId, status, recordingUrl, duration, createdAt)
   - `CallRating` (id, callId, raterId, ratedId, stars, feedback, createdAt)
   - `UnblockAppeal` (id, userId, telegramId, alias, banReason, appealText, status, createdAt)
   - `StarsTransaction` (id, userId, telegramPaymentId, starsAmount, planTier, createdAt)
   - `FavoritePartner` (id, userId, partnerId, createdAt)
4. Implement all source modules in `server/src/`:
   - `src/config/`: env validation, database (Prisma), Redis client, LiveKit client.
   - `src/bot/`: Grammy bot initialization, `/start` sub-score onboarding wizard & alias locking (`P2P-Partner-XXXX`), stealth `/admin` 2FA link generator (authorized Telegram IDs only, unrecognized command fallback for regular users), interactive menu keyboard (Find Partner, Profile, Recordings, Plans, Direct Call, Support), post-call review message (1-5 stars rating, recording access, report partner), Telegram Stars payment invoices (`currency: "XTR"`) & webhooks (`pre_checkout_query`, `successful_payment`).
   - `src/services/`:
     - $O(1)$ Redis bucket matchmaking queue (`match_queue:<band>:<weak>:<strong_skill>`) with complementary matching and instant queue cancellation ($O(1)$ `SREM`).
     - LiveKit SFU room token issuance & dual-voice audio egress recording service with headphone support.
     - Mixed-plan call duration rule ($\max(limit_A, limit_B)$).
     - Storage purge cron task enforcing retention policies (Free: 1d, Plus: 7d, Pro: 30d).
     - Moderation penalty ladder (1st report -> Warning, 2nd report -> 6h ban, 3rd report -> Permanent lock).
   - `src/middleware/`:
     - Telegram WebApp `initData` HMAC-SHA256 validation (returns HTTP 403 Forbidden for direct browser access).
     - Admin JWT authentication.
   - `src/routes/`:
     - REST API endpoints for Auth, Matchmaking, Calls, and Stealth Admin Panel (`GET /api/admin/stats`, `GET/PUT /api/admin/plans`, `GET/POST /api/admin/appeals`).
   - `src/socket/`: Socket.io signaling server.
   - `src/index.ts`: Integrated entry point.
5. Create comprehensive unit/integration test suite in `server/src/__tests__/` verifying bot commands, matchmaking logic, lockdown middleware, LiveKit token generation, moderation ladder, and admin endpoints.
6. Execute `npm run build` (`tsc`) and `npm test`. Ensure 100% build pass and test pass.
7. Write handoff report `D:\telegram-p2p-voice-call\.agents\worker_m1_1\handoff.md` detailing implementation, build outputs, test results, and file layout.
