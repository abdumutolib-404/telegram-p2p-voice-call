# Specification Mining Report: IELTS Speaking P2P Partner Match & Voice Call

**Author**: Spec Miner E2E 1 (`teamwork_preview_spec_miner`)  
**Working Directory**: `D:\telegram-p2p-voice-call\.agents\spec_miner_e2e_1`  
**Date**: 2026-08-11  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Bot Core | `/start` Onboarding | Captures IELTS sub-scores (FC, LR, GRA, P), generates & locks permanent alias, displays menu | User sub-scores input | Telegram formatted menu keyboard & confirmation | Invalid sub-score format prompts retry | ORIGINAL_REQUEST.md R1 / PROJECT.md #1 |
| 2 | Bot Core | Stealth `/admin` Command | Stealth 2FA entry point for admins | User Telegram ID | Unrecognized command response for regular users; 1-time secret link for authorized admins | Non-admin gets unknown command response | ORIGINAL_REQUEST.md R3 / PROJECT.md #13 |
| 3 | Bot Core | Interactive Keyboard | Main menu buttons (Find Partner, Profile, Recordings, Plans, Direct Call, Support) | Callback / Message buttons | Launches Mini App, views profile, streams audio, buys plans via Stars | Rate limited on spamming requests | ORIGINAL_REQUEST.md R1 / PROJECT.md #2 |
| 4 | Bot Core | Post-Call Review Card | Post-call rating (1-5 stars), partner report button, audio recording link | Button clicks | DB rating update, report escalation | Duplicate rating blocked | ORIGINAL_REQUEST.md R1 / PROJECT.md #3 |
| 5 | Mini App | WebApp Lockdown Guard | Security middleware blocking non-Telegram browser access | `X-Telegram-Init-Data` header | Next middleware if valid | HTTP 403 Forbidden if missing or HMAC mismatch | ORIGINAL_REQUEST.md R3 / PROJECT.md #12 |
| 6 | Matchmaking | $O(1)$ Redis Queue | Skill complementary matchmaking matching weak/strong IELTS sub-scores | `{ userId, band, weakSkill, strongSkill }` | `match_found` socket event with room credentials | Queue timeout or instant cancellation | ORIGINAL_REQUEST.md R4 / PROJECT.md #4 |
| 7 | Voice Call | LiveKit SFU & Token Issue | Issues 1-hour JWT token for LiveKit WebRTC SFU room | Room name, User ID, Alias | LiveKit Access Token | Denies entry if session expired | ORIGINAL_REQUEST.md R4 / PROJECT.md #5 |
| 8 | Audio Egress | Server Audio Recording | Dual-channel / mixed audio recording via LiveKit Egress | Room name, record boolean | MP4/M4A audio file saved in `RECORDINGS_DIR` | Gracefully handles client disconnect without corruption | ORIGINAL_REQUEST.md R4 / PROJECT.md #5 |
| 9 | Moderation | Penalty Ladder Engine | Escalating penalties for reported users: 1st Warning -> 2nd 6h Block -> 3rd Perm Lock | User ID, Report Reason | Warning notice or user ban timestamp | Prevents banned users from queueing | ORIGINAL_REQUEST.md R4 / PROJECT.md #6 |
| 10| Storage Purge| Daily Audio Retention Cron | Purges expired audio files based on user plan retention tier | Cron trigger (`0 0 * * *`) | Files deleted from disk, DB path set to null | Ignores missing/already deleted files | ORIGINAL_REQUEST.md Edge Cases / PROJECT.md #7 |
| 11| Payments | Telegram Stars Invoicing | In-app subscription upgrades to Plus/Pro tiers via Telegram Stars | `sendInvoice` & `pre_checkout_query` | `successful_payment` -> plan upgraded in DB | Pre-checkout rejection on invalid payload | ORIGINAL_REQUEST.md R1 / PROJECT.md #8 |
| 12| Admin Panel| Stealth 2FA Token Exchange | Exchanges 1-time secret link token + Master Password for Admin JWT | `{ token, masterPassword }` | `{ jwtToken, expiresAt }` | HTTP 401 Unauthorized on wrong password/token | ORIGINAL_REQUEST.md R3 / PROJECT.md #13 |
| 13| Admin Panel| Analytics Dashboard | Stats for Total Users, MAU/DAU, Active Calls, Telegram Stars Revenue | Admin Bearer Token | Analytics JSON | HTTP 401/403 if invalid token | PROJECT.md #14 |
| 14| Admin Panel| Dynamic Plan & Price Editor | Form to adjust call duration limits, daily call limits, retention days, Stars pricing | Plan settings payload | Updated configuration | Rejects negative or invalid values | PROJECT.md #15 |
| 15| Admin Panel| Unblock Appeals Queue | Moderation queue to review and approve/reject user unblock appeals | Appeal ID, Action (`approve`/`reject`) | User unblocked / appeal marked rejected | Rejects action on non-existent appeal | PROJECT.md #16 |
| 16| Call Logic | Mixed-Plan Call Duration | Grants higher plan's call duration limit to both participants in a mixed call | Caller Plan, Callee Plan | Granted call duration limit | Falls back to default Free limit if error | ORIGINAL_REQUEST.md Edge Cases / PROJECT.md #17 |

---

## 1. Core Interface Specifications

### A. Telegram Bot Commands & Interactive Keyboard
- **/start**: Public onboarding command.
  - Input: Telegram Chat Message `/start`.
  - Interactive Step 1: Prompt for IELTS sub-scores (`FC`, `LR`, `GRA`, `P`). Range: `5.0` - `9.0`.
  - Interactive Step 2: Generate permanent unique alias (e.g. `IELTS_Partner_4821`) and lock to user record.
  - Interactive Step 3: Render main menu inline/keyboard buttons:
    - 📞 **Find Partner** (WebApp URL button: `MINI_APP_URL`)
    - 👤 **Profile** (Sub-scores view/edit, alias, plan tier, DND toggle)
    - 📁 **Recordings** (Paginated list of past audio recordings)
    - ⭐ **Plans** (Stars payment invoice buttons for Plus / Pro)
    - 📞 **Direct Call** (Favorites list & direct invite)
    - 💬 **Support** (Help, FAQ, unblock appeal submission)
- **/admin**: Stealth authorization command.
  - Behavior: Verifies sender Telegram ID against `ADMIN_TELEGRAM_IDS`.
  - Authorized User: Generates single-use login link `${MINI_APP_URL}/admin/login?token=<random_token>` (TTL: 5 minutes in Redis key `admin_2fa_token:<token>`).
  - Unauthorized User: Returns standard unrecognized command response ("Unknown command") to maintain stealth security.

### B. Mini App WebApp Lockdown (`X-Telegram-Init-Data`)
- **Header Format**: `X-Telegram-Init-Data: <raw_init_data_query_string>`
- **Verification Algorithm**:
  1. Parse query string into key-value pairs.
  2. Extract `hash` property.
  3. Sort remaining keys alphabetically and concatenate as `key=value\n`.
  4. Compute HMAC-SHA256 signature using secret key derived via `HMAC-SHA256("WebAppData", BOT_TOKEN)`.
  5. If hex signature matches `hash` and `auth_date` is within acceptable window, allow request. Otherwise, return `403 Forbidden` (`{"error": "Mini App WebApp Lockdown: Access Restricted"}`).

### C. Socket.io Event Schemas & Payloads

| Event Name | Direction | Payload Schema | Action / Response |
|------------|-----------|----------------|-------------------|
| `join_queue` | Client -> Server | `{ userId: string, band: number, weakSkill: "FC" \| "LR" \| "GRA" \| "P", strongSkill: "FC" \| "LR" \| "GRA" \| "P" }` | Pushes user to Redis bucket `match_queue:<band>:<weakSkill>:<strongSkill>`. Performs $O(1)$ pop check. |
| `cancel_queue` | Client -> Server | `{ userId: string }` | Removes user from Redis queue instantly ($O(1)$ via hash/list removal). Emits `queue_cancelled`. |
| `match_found` | Server -> Client | `{ roomName: string, livekitToken: string, partnerAlias: string, partnerBand: number, callDurationLimit: number }` | Sent to both matched users to trigger LiveKit connection and render call screen. |
| `toggle_record` | Client -> Server | `{ roomName: string, record: boolean }` | Toggles LiveKit audio egress recording. |
| `record_status` | Server -> Client | `{ record: boolean }` | Broadcasts recording state to participants in the room. |
| `finish_call` | Client -> Server | `{ roomName: string, userId: string }` | Disconnects call, stops egress recording, sends post-call review card to Telegram. |

### D. REST API Endpoints

| Method | Path | Auth Required | Request Body | Response Payload / Behavior |
|--------|------|---------------|--------------|-----------------------------|
| `POST` | `/api/auth/verify` | `X-Telegram-Init-Data` | None | `{ user: { id, telegramId, alias, plan, band } }` |
| `GET` | `/api/calls/recording/:sessionId` | User / Admin | None | Audio stream (`audio/mpeg` or `audio/mp4`) |
| `POST` | `/api/admin/login` | None (Public Stealth) | `{ token: string, masterPassword: string }` | `{ jwtToken: string, expiresAt: string }` |
| `GET` | `/api/admin/stats` | Admin Bearer JWT | None | `{ totalUsers, mau, dau, activeCalls, starsRevenue }` |
| `GET` | `/api/admin/plans` | Admin Bearer JWT | None | Dynamic plan settings object for Free, Plus, Pro |
| `PUT` | `/api/admin/plans` | Admin Bearer JWT | `{ free: {...}, plus: {...}, pro: {...} }` | Updated plan settings |
| `GET` | `/api/admin/appeals` | Admin Bearer JWT | None | Array of pending unblock appeals |
| `POST` | `/api/admin/appeals/:id/approve` | Admin Bearer JWT | None | `{ success: true, message: "User unblocked" }` |
| `POST` | `/api/admin/appeals/:id/reject` | Admin Bearer JWT | None | `{ success: true, message: "Appeal rejected" }` |

---

## 2. Database Models & Redis Storage Formats

### A. Database Models (SQLite / PostgreSQL with Prisma)
- **User**: `id` (UUID PK), `telegramId` (BigInt/String Unique), `alias` (String Unique), `band` (Float), `subscores` (JSON), `plan` (`FREE`|`PLUS`|`PRO`), `dnd` (Boolean), `warningCount` (Int), `isBanned` (Boolean), `bannedUntil` (DateTime), `isPermanentBanned` (Boolean), `createdAt`, `updatedAt`.
- **CallSession**: `id` (UUID PK), `roomName` (String Unique), `callerId` (FK User), `calleeId` (FK User), `higherPlanTier` (`FREE`|`PLUS`|`PRO`), `maxDurationMinutes` (Int), `startedAt`, `endedAt`, `status` (`ACTIVE`|`COMPLETED`|`CANCELLED`), `egressId`, `recordingPath`, `recordingExpiresAt`.
- **CallRating**: `id` (UUID PK), `callSessionId` (FK CallSession), `reviewerId` (FK User), `targetUserId` (FK User), `rating` (Int 1-5), `reported` (Boolean), `reportReason` (String), `createdAt`.
- **UnblockAppeal**: `id` (UUID PK), `userId` (FK User), `telegramId` (BigInt/String), `appealText` (String), `status` (`PENDING`|`APPROVED`|`REJECTED`), `reviewedAt`, `createdAt`.
- **StarsTransaction**: `id` (UUID PK), `telegramId` (BigInt/String), `planTier` (`PLUS`|`PRO`), `starsAmount` (Int), `telegramPaymentChargeId`, `providerPaymentChargeId`, `createdAt`.
- **FavoritePartner**: `id` (UUID PK), `userId` (FK User), `favoriteUserId` (FK User), `createdAt`.

### B. Redis Bucket Key Formats
- Queue Key: `match_queue:<bandBucket>:<weakSkill>:<strongSkill>`
  - Example: `match_queue:6.5:FC:P` (User weak in FC, strong in P with band 6.5).
  - Complementary Pop Target: `match_queue:6.5:P:FC` (User weak in P, strong in FC with band 6.5).
- User Active Call Lock: `active_call:<userId>` (Key with TTL = call duration to prevent double queueing).
- Admin 2FA One-Time Token: `admin_2fa_token:<token>` (Value: `telegramId`, TTL: 300s).

### C. Storage Retention & Cleanup Rules
- Tier Retention Rules:
  - `FREE`: 1 day (24 hours).
  - `PLUS`: 7 days.
  - `PRO`: 30 days.
- Purge Job Execution: Daily at `00:00` UTC (`node-cron`).
  - Scans `CallSession` where `recordingExpiresAt <= NOW()`.
  - Removes physical audio file from `RECORDINGS_DIR`.
  - Updates DB record setting `recordingPath = null`.

---

## 3. Edge Cases & Observed Behaviors

| # | Feature | Input | Observed / Specified Behavior |
|---|---------|-------|-------------------------------|
| 1 | WebApp Lockdown | Direct HTTP request without `X-Telegram-Init-Data` | Returns HTTP 403 Forbidden with lockdown message. |
| 2 | WebApp Lockdown | Invalid HMAC in `X-Telegram-Init-Data` | Returns HTTP 403 Forbidden. |
| 3 | Stealth `/admin` | Regular user executes `/admin` | Returns standard unrecognized command response ("Unknown command"). |
| 4 | Admin Login 2FA | Wrong Master Password with valid token | Returns HTTP 401 Unauthorized. |
| 5 | Admin Login 2FA | Reusing expired or used token | Returns HTTP 401 Unauthorized. |
| 6 | Matchmaking | Mixed Plan Call (Free user + Pro user) | Grants Pro plan's call duration limit (e.g. 30 mins instead of Free 10 mins). |
| 7 | Matchmaking | Instant Cancel while in queue | Removes user from Redis bucket immediately ($O(1)$); no match event emitted. |
| 8 | Moderation Ladder| User receives 1st report | Warning message sent to user via Telegram bot. |
| 9 | Moderation Ladder| User receives 2nd report | 6-hour temporary ban applied (`isBanned: true`, `bannedUntil: NOW() + 6h`). |
| 10| Moderation Ladder| User receives 3rd report | Permanent ban applied (`isPermanentBanned: true`). Rejects queue join attempts. |
| 11| Storage Cleanup | Audio file expired past retention limit | File deleted from disk, DB `recordingPath` cleared. |

---

## 4. Test Framework & Environment Analysis

- Node Environment: Node.js v20+ with ES2022 TypeScript support (`ts-node` or `tsx`).
- Available / Recommended Test Packages:
  - `node:test` (Built-in Node.js runner) or `vitest` / `jest`.
  - `supertest` for REST API endpoint verification.
  - `socket.io-client` for Socket.io signaling integration tests.
  - `better-sqlite3` or Prisma Client for direct database state assertion.

---

## 5. Recommended E2E Test Harness Structure (Tiers 1-4)

```
test/
├── harness/
│   ├── env.ts                # Test environment config & mocks
│   ├── db.ts                 # Database cleanup & seed utilities
│   ├── botMock.ts            # Telegram Bot API mock runner
│   ├── socketClient.ts       # Socket.io client test helper
│   └── webappAuth.ts         # Telegram initData HMAC generator for tests
├── tier1_protocol/           # Tier 1: Unit & Component Protocol Tests
│   ├── initDataHmac.test.ts  # HMAC calculation & 403 lockdown tests
│   ├── redisBucket.test.ts   # $O(1)$ bucket key format & complementarity logic
│   └── livekitToken.test.ts  # Token issuance & expiry verification
├── tier2_api_socket/         # Tier 2: API & Socket Integration Tests
│   ├── adminAuth.test.ts     # Stealth 2FA token exchange & JWT verification
│   ├── restEndpoints.test.ts # Admin stats, plans, appeals REST endpoints
│   └── socketEvents.test.ts  # join_queue, cancel_queue, match_found handlers
├── tier3_workflows/          # Tier 3: Workflow & State Integration Tests
│   ├── matchmaking.test.ts   # End-to-end complementary matchmaking flow
│   ├── mixedPlan.test.ts     # Higher-tier duration limit resolution
│   ├── moderation.test.ts    # Escalating penalty ladder (Warning -> 6h -> Perm)
│   └── storagePurge.test.ts  # Retention-based daily audio file cleanup
└── tier4_opaque_e2e/         # Tier 4: Requirement-Driven Opaque-Box E2E Tests
    ├── userOnboarding.test.ts# Complete onboarding & alias locking journey
    ├── fullCallSession.test.ts# Queue -> Match -> Call -> Record -> Finish -> Review
    └── adminAppeals.test.ts  # Stealth 2FA -> Appeals Queue -> Approve Unblock
```

---

## Verification & Summary

This report establishes the complete interface contract, database schema, socket schemas, 2FA mechanics, and test harness structure required to build and validate the IELTS Speaking P2P Partner Match & Voice Call platform across Milestones M1 to M4.
