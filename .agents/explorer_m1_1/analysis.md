# Infrastructure & Codebase Gap Analysis Report: Backend Server (`server/`)

**Author**: Explorer 1 (`teamwork_preview_explorer`)  
**Date**: 2026-08-11  
**Target Module**: Backend Core Engine (`D:\telegram-p2p-voice-call\server`)  
**Scope**: Milestone M1 — Infrastructure, Dependencies, Database, Redis, LiveKit, Express, Grammy Bot  

---

## 1. Executive Summary & Baseline Status

The `server/` directory is currently in a skeletal state. It contains configuration manifests (`package.json`, `package-lock.json`, `tsconfig.json`, `.env`), but **`src/` directory is entirely missing**.

### Key Baseline Findings:
- **Build Status**: Running `npm run build` (`tsc`) fails with `error TS18003: No inputs were found in config file 'tsconfig.json'` because no TypeScript files exist in `src/`.
- **Dependencies**: Essential packages required for Database ORM, Redis queueing, LiveKit WebRTC token generation & Egress audio recording, JWT auth, cron scheduling, and rate-limiting are missing from `package.json`.
- **Environment**: `.env` contains minimal variables (`PORT`, `BOT_TOKEN`, `MINI_APP_URL`), missing database, Redis, LiveKit, admin auth, and recording path configurations.

---

## 2. Dependency & Package Audit

### Currently Installed Dependencies:
```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "grammy": "^1.26.0",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  }
}
```

### Missing Production Dependencies to Install:
1. **Database / ORM**:
   - `prisma` & `@prisma/client` (Recommended ORM for strict TypeScript typing and SQLite/PostgreSQL support).
2. **Redis Client**:
   - `ioredis` & `@types/ioredis` (Fast Redis client required for $O(1)$ bucketized queue & cache).
3. **LiveKit WebRTC & Egress SDK**:
   - `livekit-server-sdk` (Token issue, room management, dual-voice audio egress recording).
4. **Authentication & Cryptography**:
   - `jsonwebtoken` & `@types/jsonwebtoken` (JWT issuance & verification for stealth `/admin` 2FA).
5. **Cron & Background Tasks**:
   - `node-cron` & `@types/node-cron` (Daily automated audio recording purge task).
6. **Utilities**:
   - `uuid` & `@types/uuid` (Unique ID generation for rooms and sessions).
   - `bottleneck` (Rate-limiting queue for outgoing Telegram Bot API notifications to avoid 429 errors).

### Required `package.json` Script Additions:
```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "ts-node src/index.ts",
  "db:push": "prisma db push",
  "db:generate": "prisma generate",
  "db:studio": "prisma studio"
}
```

---

## 3. `tsconfig.json` & Build Configuration Analysis

Current `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

### Assessment:
- `moduleResolution: NodeNext` requires relative TypeScript imports to specify explicit `.js` extensions (e.g. `import { config } from './config/env.js';`) or require bundler mode.
- Recommendation: Ensure all internal module imports use standard NodeNext import syntax or adjust module resolution if ts-node execution requires it.

---

## 4. Environment Configuration (`src/config/`) Blueprint

| File Path | Purpose | Key Variables / Exports |
|-----------|---------|-------------------------|
| `src/config/env.ts` | Centralized typed environment parser | `PORT` (default 3001), `BOT_TOKEN`, `MINI_APP_URL`, `ADMIN_TELEGRAM_IDS` (array of numbers), `MASTER_PASSWORD`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `LIVEKIT_HOST`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RECORDINGS_DIR` |
| `src/config/database.ts` | Prisma Client singleton | `export const prisma = new PrismaClient();` |
| `src/config/redis.ts` | IORedis client connection | `export const redis = new Redis(env.REDIS_URL);` |
| `src/config/livekit.ts` | LiveKit clients | `AccessToken`, `RoomServiceClient`, `EgressClient` helper instances |

---

## 5. System Infrastructure Mapping: Exists vs Missing

### A. Database (Prisma ORM + SQLite / PostgreSQL)
- **Status**: Missing schema and models.
- **Required Models**:
  1. `User`:
     - `id` (UUID), `telegramId` (BigInt/String, unique, indexed), `alias` (String, unique), `band` (Float), `subscores` (FC, LR, GRA, P Floats), `plan` (`FREE` | `PLUS` | `PRO`), `dnd` (Boolean, default false), `warningCount` (Int, default 0), `isBanned` (Boolean, default false), `bannedUntil` (DateTime, nullable), `isPermanentBanned` (Boolean, default false), `createdAt`, `updatedAt`.
  2. `CallSession`:
     - `id` (UUID), `roomName` (String, unique), `callerId` (FK User), `calleeId` (FK User), `higherPlanTier` (`FREE`|`PLUS`|`PRO`), `maxDurationMinutes` (Int), `startedAt` (DateTime), `endedAt` (DateTime, nullable), `status` (`ACTIVE`|`COMPLETED`|`CANCELLED`), `egressId` (String, nullable), `recordingPath` (String, nullable), `recordingExpiresAt` (DateTime, nullable).
  3. `CallRating`:
     - `id` (UUID), `callSessionId` (FK CallSession), `reviewerId` (FK User), `targetUserId` (FK User), `rating` (Int 1-5, nullable), `reported` (Boolean, default false), `reportReason` (String, nullable), `createdAt`.
  4. `UnblockAppeal`:
     - `id` (UUID), `userId` (FK User), `telegramId` (BigInt/String), `appealText` (String), `status` (`PENDING`|`APPROVED`|`REJECTED`), `reviewedAt` (DateTime, nullable), `createdAt`.
  5. `StarsTransaction`:
     - `id` (UUID), `telegramId` (BigInt/String), `planTier` (`PLUS`|`PRO`), `starsAmount` (Int), `telegramPaymentChargeId` (String), `providerPaymentChargeId` (String), `createdAt`.
  6. `FavoritePartner`:
     - `id` (UUID), `userId` (FK User), `favoriteUserId` (FK User), `createdAt`.

### B. Redis Bucketized $O(1)$ Matchmaking Engine
- **Status**: Missing service logic.
- **Required Bucket Queue Design**:
  - Bucket key pattern: `match_queue:<bandBucket>:<weakSkill>:<strongSkill>`
  - Band buckets: `5.0`, `5.5`, `6.0`, `6.5`, `7.0`, `7.5`, `8.0+`.
  - Skill Complementarity: User A (weak FC, strong P) matches with User B (weak P, strong FC).
  - $O(1)$ Queue Operations:
    - `join_queue`: User added to complementary queue bucket (`RPOP` / `RPUSH`). If partner present in matching bucket, pop partner and form call room immediately.
    - `cancel_queue`: Remove user from queue bucket instantly ($O(1)$ using Redis hash set or `LREM`).
    - User active session index: `active_call:<userId>` stored with expiration to block double-queueing.

### C. LiveKit SFU & Audio Egress Recording Service
- **Status**: Missing token generator & egress controller.
- **Required Logic**:
  - `generateRoomToken(roomName: string, userId: string, alias: string)`: Returns LiveKit JWT token using `AccessToken` with `roomJoin: true` and 1-hour expiry.
  - `startAudioEgress(roomName: string)`: Calls LiveKit `EgressClient.startRoomCompositeEgress` or `startTrackCompositeEgress` to record both audio channels into MP4/M4A in `RECORDINGS_DIR`.
  - `stopAudioEgress(egressId: string)`: Stops egress recording on call termination and updates `CallSession.recordingPath` and `recordingExpiresAt`.
  - Daily Storage Cleanup Cron (`src/services/storage.ts`):
    - Retention enforcement: `FREE` (1 day), `PLUS` (7 days), `PRO` (30 days).
    - Runs daily via `node-cron` (`0 0 * * *`), deletes expired physical audio files from disk, and sets `recordingPath = null`.

### D. Express Server & Socket.io Signaling
- **Status**: Basic server dependencies in `package.json`, missing application structure.
- **Required Routes & Middlewares**:
  - `initDataLockdown.ts` middleware: Validates `X-Telegram-Init-Data` header using HMAC-SHA256 signature with `BOT_TOKEN`. Returns HTTP 403 Forbidden for direct browser hits.
  - `adminAuth.ts` middleware: Verifies JWT token from `Authorization: Bearer <token>` for admin REST API endpoints.
  - REST Endpoints (`src/routes/`):
    - `POST /api/auth/verify`: Validates initData and returns user context.
    - `GET /api/calls/recording/:sessionId`: Streams recording file (if authorized).
    - `POST /api/admin/login`: Verifies master password & 1-time token, returns JWT.
    - `GET /api/admin/stats`: Analytics (Users, MAU, Active Calls, Stars revenue).
    - `GET/PUT /api/admin/plans`: View/edit dynamic tier duration limits & pricing.
    - `GET/POST /api/admin/appeals`: View pending unblock appeals and approve/reject.
  - Socket.io Signaling (`src/socket/signaling.ts`):
    - `join_queue` -> Triggers Redis matchmaking.
    - `cancel_queue` -> Removes user from Redis queue.
    - `match_found` -> Emitted to both clients with `roomName`, `livekitToken`, `partnerAlias`, `callDurationLimit`.
    - `toggle_record` -> Toggles egress recording.
    - `finish_call` -> Stops recording, updates DB status, sends post-call review message to Telegram.

### E. Grammy Telegram Bot
- **Status**: Dependency present, missing bot implementation.
- **Required Command & Event Handlers**:
  - `/start`: Interactive sub-scores onboarding flow (FC, LR, GRA, P). Plain-text permanent alias generation and locking. Renders top-level interactive menu.
  - `/admin`: Stealth command. Checks user Telegram ID against `ADMIN_TELEGRAM_IDS`. If match, generates 1-time 2FA link (`MINI_APP_URL/admin/login?token=...`). If non-match, sends standard "Unknown command" response.
  - Interactive Menu Buttons:
    - 📞 **Find Partner** (WebApp button launching Mini App).
    - 👤 **Profile** (View/edit sub-scores, plan status, DND toggle).
    - 📁 **Recordings** (Browse & play session audio recordings).
    - ⭐ **Plans** (Upgrade to Plus/Pro via Telegram Stars `sendInvoice`).
    - 📞 **Direct Call** (Initiate call to favorite partners).
    - 💬 **Support** (Support info & feedback submission).
  - Telegram Stars Handlers (`pre_checkout_query`, `successful_payment`).
  - Post-Call Review Card: Automatically sent post-call. 1-5 star call quality rating, recording access button, partner reporting button.
  - Moderation Escalation Engine: 1st report -> Warning notice; 2nd report -> 6-hour temporary ban; 3rd report -> Permanent lock.
  - Telegram API 429 Protection: Queue outbound messages with automatic retry on rate limits.

---

## 6. Target Directory Layout for Worker

```
server/
├── package.json
├── package-lock.json
├── tsconfig.json
├── .env
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts
    ├── config/
    │   ├── env.ts
    │   ├── database.ts
    │   ├── redis.ts
    │   └── livekit.ts
    ├── bot/
    │   ├── bot.ts
    │   ├── middleware/
    │   │   └── auth.ts
    │   ├── handlers/
    │   │   ├── start.ts
    │   │   ├── admin.ts
    │   │   ├── profile.ts
    │   │   ├── recordings.ts
    │   │   ├── plans.ts
    │   │   ├── directCall.ts
    │   │   ├── support.ts
    │   │   └── review.ts
    │   └── notifications.ts
    ├── services/
    │   ├── matchmaking.ts
    │   ├── livekit.ts
    │   ├── moderation.ts
    │   ├── storage.ts
    │   └── analytics.ts
    ├── middleware/
    │   ├── initDataLockdown.ts
    │   └── adminAuth.ts
    ├── routes/
    │   ├── auth.ts
    │   ├── calls.ts
    │   └── admin.ts
    └── socket/
        └── signaling.ts
```

---

## 7. Concrete Worker Action Plan

1. **Install Missing Dependencies**:
   ```bash
   npm install prisma @prisma/client ioredis livekit-server-sdk jsonwebtoken node-cron uuid bottleneck
   npm install --save-dev @types/ioredis @types/jsonwebtoken @types/node-cron @types/uuid
   ```
2. **Initialize Prisma & Schema**:
   Set up `prisma/schema.prisma` with `User`, `CallSession`, `CallRating`, `UnblockAppeal`, `StarsTransaction`, `FavoritePartner` models, and run `npx prisma db push`.
3. **Implement Core Configs**:
   Build `src/config/env.ts`, `src/config/database.ts`, `src/config/redis.ts`, and `src/config/livekit.ts`.
4. **Build Core Services**:
   Implement Redis $O(1)$ matchmaking service, LiveKit room token & Egress recorder service, moderation ladder engine, and daily storage purge cron task.
5. **Implement Middlewares & Express API**:
   Build `initDataLockdown.ts` (HMAC validation for HTTP 403 response), `adminAuth.ts` (JWT verification), and REST routes in `src/routes/`.
6. **Implement Socket.io Signaling**:
   Build queue join/cancel, match notification, record toggle, and call completion socket handlers.
7. **Implement Grammy Bot**:
   Build `/start` onboarding, stealth `/admin`, interactive menu handlers, post-call review card, and Telegram Stars payment integration.
8. **Verify Build**:
   Execute `npm run build` (`tsc`) and ensure zero compilation errors.
