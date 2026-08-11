# Backend Survey & Architecture Handoff Report

## 1. Observation

Direct examination of `D:\telegram-p2p-voice-call\server` reveals the following state:

- **Directory Contents**:
  - `package.json` (`D:\telegram-p2p-voice-call\server\package.json`):
    - `name`: `"telegram-p2p-voice-server"`
    - Current dependencies: `cors` (^2.8.5), `dotenv` (^16.4.5), `express` (^4.19.2), `grammy` (^1.26.0), `socket.io` (^4.7.5).
    - Current devDependencies: `@types/cors`, `@types/express`, `@types/node`, `ts-node`, `typescript` (^5.4.5).
    - Scripts: `build` (`tsc`), `start` (`node dist/index.js`), `dev` (`ts-node src/index.ts`).
  - `tsconfig.json` (`D:\telegram-p2p-voice-call\server\tsconfig.json`):
    - `target`: `ES2022`, `module`: `NodeNext`, `moduleResolution`: `NodeNext`, `rootDir`: `./src`, `outDir`: `./dist`.
  - `.env` (`D:\telegram-p2p-voice-call\server\.env`):
    - `PORT=3001`
    - `BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE`
    - `MINI_APP_URL=http://localhost:5173`
  - **Source Directory (`src/`)**: Currently **does not exist**; no source TypeScript files have been created yet.

---

## 2. Logic Chain

From the observations and requirements in `D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md`:

1. **Absence of Source Code**:
   - The `server` folder is an uninitialized project skeleton. The `src/` directory needs to be built from scratch, including database initialization, bot handlers, API routes, WebRTC signaling/LiveKit integration, Redis queueing, payment processing, moderation, and cleanup jobs.

2. **Missing Package Dependencies**:
   - **Database**: Needs a lightweight, zero-config ORM/driver suitable for local dev and production. SQLite via `better-sqlite3` and `prisma` (or `drizzle-orm` / `sqlite3`) will provide persistent storage for Users, Calls, Recordings, Reports, Stars Payments, and System Settings.
   - **Matchmaking & Caching**: Needs `ioredis` (or `ioredis-mock` fallback) for the $O(1)$ bucketized Redis matchmaking queue.
   - **WebRTC & Audio Egress**: Needs `livekit-server-sdk` for room token issuance and server-side audio recording egress control.
   - **Authentication & Security**: Needs `jsonwebtoken` for admin JWT session management and Telegram `initData` HMAC-SHA256 crypto verification.
   - **Task Scheduling & Queuing**: Needs `node-cron` for daily audio recording purge tasks and rate-limit queuing.

3. **Core Feature Architecture Requirements**:
   - **Telegram Bot (`grammy`)**:
     - Slash commands: `/start` (public onboarding & interactive menu) and `/admin` (stealth 2FA link generation).
     - Interactive Telegram menu:
       - 📞 **Find Partner** (launches Mini App WebApp button)
       - 👤 **Profile** (FC, LR, GRA, P sub-score view/edit, alias lock display, plan status, DND toggle)
       - 📁 **Recordings** (list past calls, send audio `.mp3`/`.ogg` files)
       - ⭐ **Plans** (Telegram Stars payment invoice generator)
       - 📞 **Direct Call** (favorite partners menu & direct call trigger)
       - 💬 **Support** (feedback collector)
     - Telegram Stars payment webhook (`pre_checkout_query` and `message:successful_payment`).
     - Post-call review messages (audio quality 1-5 rating, partner report button).
   - **Matchmaking Engine ($O(1)$ Redis Bucket Queue)**:
     - IELTS sub-scores: Fluency & Coherence (FC), Lexical Resource (LR), Grammatical Range & Accuracy (GRA), Pronunciation (P).
     - Users matched by complementary weak/strong sub-scores within target band brackets.
     - $O(1)$ push/pop operations using Redis sets/lists (`match_queue:<band>:<weak_skill>:<strong_skill>`).
     - Instant cancellation handling ($O(1)$ item removal).
   - **LiveKit SFU & Egress Audio Recording**:
     - Issue LiveKit tokens for active call sessions.
     - Dual-voice server-side audio recording egress (headphones support, auto-mixing).
     - Automated daily audio purge cron job according to tier limits (Free: 1 day, Plus: 7 days, Pro: 30 days).
   - **Web Admin Panel API & Stealth Access**:
     - `/admin` stealth command verifies authorized Telegram admin ID. If non-admin, returns standard unrecognized command error. If admin, generates 1-time 2FA login link.
     - Master Password verification -> JWT token.
     - Mini App WebApp Lockdown middleware: Validates `initData` HMAC-SHA256 signature, returning `403 Forbidden` for direct browser accesses.
     - Endpoints: Total Users/MAU, Telegram Stars revenue analytics, dynamic plan limits/pricing editor, Unblock Appeals review queue.
   - **Moderation Penalty Ladder**:
     - Automated penalty: 1st Report -> Warning notification; 2nd Report -> 6-hour temporary ban; 3rd Report -> Permanent lock.
     - Appeals queue managed via Admin Panel.

---

## 3. Caveats

1. **Redis Availability**: If a live Redis server is unavailable during testing, an in-memory Redis fallback (e.g. `ioredis-mock` or internal Map-based queue) should be implemented so the server runs seamlessly in dev mode.
2. **LiveKit Egress Server**: In environments without a running LiveKit egress daemon, room token generation and mock egress recording endpoints should gracefully handle missing LiveKit credentials.
3. **Telegram Bot Token**: The bot relies on `BOT_TOKEN`. In local dev without a live token, mock test handlers or conditional polling mode should prevent process crashes.

---

## 4. Conclusion & Recommended Server Architecture

### Proposed File Structure (`D:\telegram-p2p-voice-call\server\src`)

```
server/src/
├── config/
│   ├── env.ts             # Validated environment variables (PORT, BOT_TOKEN, JWT_SECRET, etc.)
│   ├── database.ts        # Prisma / SQLite client initialization
│   ├── redis.ts           # Redis client with in-memory fallback
│   └── livekit.ts         # LiveKit Room & Egress client initialization
├── database/
│   └── schema.prisma      # Database schema (User, Favorite, SessionCall, Recording, Report, StarTransaction, Config)
├── bot/
│   ├── bot.ts             # Grammy Bot instance setup & command registration
│   ├── middleware.ts     # Admin check & rate-limiting middleware
│   ├── handlers/
│   │   ├── start.ts       # /start command & onboarding flow
│   │   ├── admin.ts       # Stealth /admin command with 2FA token generation
│   │   ├── profile.ts     # Profile view/edit, sub-scores, DND toggle
│   │   ├── recordings.ts  # Audio recordings list & playback
│   │   ├── plans.ts       # Telegram Stars invoice & payments handler
│   │   ├── direct_call.ts # Favorite partners & direct calling
│   │   └── support.ts     # Support & feedback handling
│   └── notifications.ts  # Rate-limited Telegram notification queue (429 handling)
├── services/
│   ├── matchmaking.service.ts # Redis $O(1)$ bucket queue logic
│   ├── livekit.service.ts     # Room token creation & egress recording controls
│   ├── moderation.service.ts  # Penalty ladder (Warning -> 6h -> Permanent)
│   ├── analytics.service.ts   # MAU, Stars revenue, usage stats
│   └── storage.service.ts     # Audio file storage & daily purge cron job
├── middleware/
│   ├── auth.middleware.ts     # Telegram WebApp initData HMAC verification (403 Lockdown)
│   └── admin.middleware.ts    # JWT verification for Admin Panel
├── routes/
│   ├── auth.routes.ts         # MiniApp auth & Admin 2FA login routes
│   ├── match.routes.ts        # MiniApp radar queue & active call state
│   ├── calls.routes.ts        # Call end, post-call summary rating & reports
│   └── admin.routes.ts        # Stats, plan settings, appeals queue
├── socket/
│   └── signaling.ts           # Socket.io signaling, heartbeats, call events
└── index.ts                   # Express server startup, HTTP server, Socket.io, Cron jobs
```

---

## 5. Verification Method

To verify the backend implementation:

1. **Dependencies Check**:
   Run `npm install` in `D:\telegram-p2p-voice-call\server` to confirm all required packages install cleanly.
2. **Build Verification**:
   Run `npm run build` (`tsc`) in `D:\telegram-p2p-voice-call\server` to ensure zero TypeScript errors.
3. **Runtime & Test Suite**:
   Run `npm run dev` or test scripts verifying:
   - WebApp Lockdown returns `403 Forbidden` for requests missing valid Telegram `initData`.
   - `/admin` stealth command returns "Unknown command" for unauthorized Telegram IDs.
   - Redis matchmaking queue correctly matches complementary sub-score buckets ($O(1)$).
   - Mixed-plan calls correctly resolve call duration limits ($\max(limit_A, limit_B)$).
   - Moderation service correctly escalates penalties (Warning -> 6h Block -> Permanent Lock).
