# Explorer 3 Analysis Report: Backend Core Services & REST/Socket APIs

**Author**: Explorer 3 (`explorer_m1_3`)  
**Target Project**: IELTS Speaking P2P Partner Match & Voice Call  
**Working Directory**: `D:\telegram-p2p-voice-call\.agents\explorer_m1_3`  
**Server Directory**: `D:\telegram-p2p-voice-call\server`  
**Milestone**: M1 (Backend Core Engine)  

---

## 1. Observation

Direct examination of the repository at `D:\telegram-p2p-voice-call` revealed:
1. **Server Directory Structure**: `server/` contains `package.json`, `package-lock.json`, `tsconfig.json`, `.env`, and `node_modules/`. The TypeScript source directory `server/src/` **does not exist yet**.
2. **Current `server/package.json` Dependencies**:
   - Included: `cors (^2.8.5)`, `dotenv (^16.4.5)`, `express (^4.19.2)`, `grammy (^1.26.0)`, `socket.io (^4.7.5)`.
   - Missing required packages for core services: `ioredis` (Redis client for $O(1)$ queues & stealth token cache), `livekit-server-sdk` (SFU token issuance & Egress recording control), `@prisma/client` / `prisma` (database persistence layer), `jsonwebtoken` (Admin JWT tokens), `node-cron` (Daily storage purge scheduled job), `bcrypt` (Master password authentication).
3. **Assigned Sub-System Scope**:
   - $O(1)$ Redis bucketized queue matchmaking engine (`match_queue:<band>:<weak>:<strong_skill>`) and instant cancellation.
   - LiveKit SFU room token API & server-side dual-voice Egress audio recording with headphone support.
   - Daily storage cleanup cron enforcing retention policies (Free: 1 day, Plus: 7 days, Pro: 30 days).
   - Automated moderation penalty ladder (Warning -> 6h temporary block -> Permanent lock).
   - Mixed-plan call max duration calculation rule ($\max(limit_A, limit_B)$).
   - Telegram WebApp `initData` HMAC validation middleware (403 Forbidden lockdown).
   - Stealth `/admin` token exchange & Admin REST endpoints (`GET /api/admin/stats`, `GET/PUT /api/admin/plans`, `GET/POST /api/admin/appeals`).

---

## 2. Logic Chain

### 2.1 $O(1)$ Redis Bucketized Queue Matchmaking Engine & Instant Cancellation

- **Bucket Key Schema**: `match_queue:<band>:<weak_skill>:<strong_skill>`
  - Band brackets: `5.5`, `6.0`, `6.5`, `7.0`, `7.5`, `8.0`, `8.5`, `9.0`.
  - IELTS Sub-scores: `FC` (Fluency & Coherence), `LR` (Lexical Resource), `GRA` (Grammatical Range & Accuracy), `P` (Pronunciation).
  - User A bucket: `match_queue:<bandA>:<weakA>:<strongA>`
- **Complementary Matching Rule**:
  - User A's weak skill must match User B's strong skill, AND User B's weak skill must match User A's strong skill.
  - Complementary bucket for User A: `match_queue:<bandA>:<strongA>:<weakA>`.
- **Match Search Execution ($O(1)$)**:
  1. User A joins queue via Socket event `join_queue`.
  2. Server performs atomic pop on complementary bucket: `SPOP match_queue:<bandA>:<strongA>:<weakA>`.
  3. If candidate User B is returned:
     - Remove User B's tracking key `DEL user_queue:userIdB`.
     - Calculate mixed-plan call limit: $\max(limit_A, limit_B)$.
     - Create room name `room_<uuid>`, issue LiveKit tokens for A & B.
     - Emit `match_found` to both user sockets.
  4. If no candidate found:
     - Add User A to bucket: `SADD match_queue:<bandA>:<weakA>:<strongA> userIdA`.
     - Track active user location: `SET user_queue:userIdA match_queue:<bandA>:<weakA>:<strongA>`.
- **Instant Queue Cancellation ($O(1)$)**:
  1. User emits `cancel_queue`.
  2. Server fetches `bucketKey = GET user_queue:userIdA`.
  3. If `bucketKey` exists, execute atomic remove: `SREM <bucketKey> userIdA` and `DEL user_queue:userIdA`.
  4. Emits `queue_cancelled`.

### 2.2 LiveKit SFU Room Token & Server-Side Dual-Voice Egress Audio Recording

- **LiveKit Room Token Generation**:
  - Express route `POST /api/calls/token` or Socket event `join_room`.
  - Uses `AccessToken` from `livekit-server-sdk` with claims `{ roomJoin: true, room: roomName, identity: userId, name: alias }`.
- **Dual-Voice Egress Audio Recording with Headphone Support**:
  - LiveKit `EgressClient` invokes `startRoomCompositeEgress` or `startTrackCompositeEgress` with `AudioCodec.MP3`.
  - Headphone Support Architecture: Because LiveKit SFU captures and mixes participant audio streams directly at the WebRTC media bridge level before emitting to disk, client acoustic feedback, loudspeaker leakage, and hardware differences (headphones vs speakers) are fully isolated. Server egress produces crystal-clear dual-voice composite recordings.
- **Recording Control**:
  - Socket event `toggle_record` payload `{ roomName, record: boolean }`.
  - `record: true` -> Calls `egressClient.startRoomCompositeEgress(...)`, stores `egressId` in active session, emits `record_status` `{ record: true }`.
  - `record: false` -> Calls `egressClient.stopEgress(egressId)`, clears `egressId`, emits `record_status` `{ record: false }`.
- **Call End & Save**:
  - Socket event `finish_call` stops active egress recording, creates `Recording` record in database with retention `expiresAt`, and triggers Telegram post-call review card with rating buttons & recording listen link.

### 2.3 Daily Storage Purge Cron Job & Tier Audio Retention Policies

- **Retention Rules**:
  - `Free` Tier: 1 Day retention (`expiresAt = createdAt + 24 Hours`)
  - `Plus` Tier: 7 Days retention (`expiresAt = createdAt + 7 Days`)
  - `Pro` Tier: 30 Days retention (`expiresAt = createdAt + 30 Days`)
- **Daily Purge Scheduler**:
  - Implemented using `node-cron` running daily at `00:00:00 UTC` (`0 0 * * *`).
  - Purge Sequence:
    1. Query database: `SELECT * FROM Recording WHERE expiresAt <= NOW()`.
    2. Unlink audio file from disk: `fs.promises.unlink(filePath)`.
    3. Delete database entry: `Recording.delete(...)`.
    4. Log purged file count, freed disk space, and handle missing files gracefully.

### 2.4 Automated Moderation Penalty Ladder

- **Report Accumulation**:
  - Reports submitted after calls via post-call summary card or admin dashboard.
  - Increment reported user's `reportCount` and store `Report` entry.
- **Penalty Escalation**:
  - **1st Report (Warning)**: Sets `moderationStatus = 'WARNED'`. Telegram bot sends warning alert to user.
  - **2nd Report (6-Hour Block)**: Sets `moderationStatus = 'TEMP_BANNED'`, `bannedUntil = NOW() + 6 Hours`. Rejects queue join requests and socket connections during ban window. Telegram bot notifies user of temporary suspension.
  - **3rd Report (Permanent Lock)**: Sets `moderationStatus = 'PERM_BANNED'`, `isPermanentlyBanned = true`. System completely locks account and rejects all WebApp API / socket requests. User may only submit an unblock appeal via Telegram bot support.

### 2.5 Mixed-Plan Call Duration Calculation Rule

- **Formula**: $\max(limit_A, limit_B)$
- **Plan Limits**:
  - Free: 15 minutes (900s)
  - Plus: 30 minutes (1800s)
  - Pro: 60 minutes (3600s)
- **Execution**:
  - At match creation, look up Plan A and Plan B limits.
  - Assign `callDurationLimit = Math.max(limitA, limitB)`.
  - Pass `callDurationLimit` to both users in `match_found` payload.
  - Server sets background timer for `callDurationLimit * 1000` ms to auto-terminate call if participants do not disconnect manually.

### 2.6 Telegram WebApp `initData` HMAC Validation Middleware (403 Lockdown)

- **Security Guard**: Express middleware `validateTelegramInitData` applied to all Mini App API endpoints (`/api/call/*`, `/api/match/*`).
- **Validation Algorithm**:
  1. Extract `X-Telegram-Init-Data` header. Return 403 if missing.
  2. Extract `hash` parameter from query string.
  3. Sort remaining key-value parameters alphabetically (`key=value` separated by `\n`).
  4. Derive secret key: `HMAC-SHA256("WebAppData", BOT_TOKEN)`.
  5. Compute test hash: `HMAC-SHA256(dataCheckString, secretKey)` in hex format.
  6. If test hash !== extracted hash -> Return HTTP `403 Forbidden`.
  7. Validate freshness (`auth_date` within 24 hours).
  8. Parse user JSON payload and attach to `req.telegramUser`.

### 2.7 Stealth `/admin` Token Exchange & Admin REST Endpoints

- **Stealth Token Generation**:
  - When authorized Telegram user issues `/admin` bot command (Telegram ID checked against `ADMIN_TELEGRAM_IDS` env list):
    - Generate secure 1-time `loginToken`.
    - Store `admin_token:<loginToken> = telegramId` in Redis with 5-minute TTL.
    - Bot sends private login link: `https://admin.yourdomain.com/login?token=<loginToken>`.
- **Token Exchange API (`POST /api/admin/login`)**:
  - Validates `token` in Redis and `masterPassword` against `ADMIN_MASTER_PASSWORD`.
  - Deletes `admin_token:<token>` from Redis.
  - Signs JWT token with 24-hour expiration (`role: 'admin'`).
  - Returns `{ token: jwtToken, expiresAt }`.
- **Admin Authentication Middleware (`requireAdminAuth`)**:
  - Verifies JWT in `Authorization: Bearer <jwtToken>` header. Returns 401 if missing/invalid.
- **Admin Management API Endpoints**:
  - `GET /api/admin/stats`: Total users, MAU, DAU, active calls, Telegram Stars revenue analytics.
  - `GET /api/admin/plans` & `PUT /api/admin/plans`: Read & update tier limits, retention policies, and Stars prices.
  - `GET /api/admin/appeals`: List pending ban appeals.
  - `POST /api/admin/appeals/:id/approve` & `POST /api/admin/appeals/:id/reject`: Approve or reject ban appeals, resetting report counts and sending Telegram bot notifications.

---

## 3. Caveats

1. **Missing NPM Dependencies**: `server/package.json` must be updated with `ioredis`, `livekit-server-sdk`, `@prisma/client`, `prisma`, `jsonwebtoken`, `node-cron`, `bcrypt`, and `@types/*` before code execution.
2. **LiveKit Server Instance**: LiveKit Egress requires a running LiveKit server instance with Egress service configured (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
3. **Database Setup**: Prisma schema must be initialized (`prisma init`) and migrated (`npx prisma db push` / `migrate`) to create SQLite database file.

---

## 4. Conclusion

All 7 core backend services and API requirements have been fully analyzed and specified. The design provides $O(1)$ matchmaking performance, robust server-side audio recording with headphone isolation, automated tiered audio cleanup, a 3-stage moderation penalty ladder, fair mixed-plan call limits, strict HMAC WebApp lockdown security, and a stealth 2FA admin API.

### Recommended Target File Layout for Implementer:
```
server/
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── config/
    │   ├── env.ts
    │   ├── db.ts
    │   ├── redis.ts
    │   └── livekit.ts
    ├── middleware/
    │   ├── telegramAuth.ts
    │   └── adminAuth.ts
    ├── services/
    │   ├── matchmakingService.ts
    │   ├── livekitService.ts
    │   ├── storageService.ts
    │   ├── moderationService.ts
    │   ├── planService.ts
    │   └── analyticsService.ts
    ├── routes/
    │   ├── adminRoutes.ts
    │   ├── callRoutes.ts
    │   └── userRoutes.ts
    └── socket/
        └── socketHandler.ts
```

---

## 5. Verification Method

1. **Dependency Installation & Build Verification**:
   - Add missing packages to `server/package.json`.
   - Run `npm run build` in `server/` to verify TypeScript compilation with zero errors.
2. **Unit & Service Tests**:
   - Test Redis bucket operations ($O(1)$ `SADD`, `SPOP`, `SREM`) using mock Redis client / ioredis-mock.
   - Test `validateTelegramInitData` HMAC signature verification with test vectors.
   - Test `max(limitA, limitB)` calculation for all plan matrix combinations (Free-Free, Free-Plus, Plus-Pro, etc.).
   - Test Moderation Penalty Ladder escalation (1 report -> Warning, 2 reports -> 6h block, 3 reports -> Perm lock).
   - Test Storage Cleanup Cron job date filtering logic.
