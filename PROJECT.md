# Project: PairTalk IELTS Speaking Platform — Production Finalization

## Architecture
PairTalk is an enterprise-grade Telegram Bot + Telegram Mini App + Web Admin Panel platform for IELTS speaking peer-to-peer voice calling.

- **Server (`server/`)**: Node.js/Express, TypeScript, Prisma ORM / PostgreSQL, Redis for $O(1)$ queues and rate limiting, Socket.IO for signaling, LiveKit SFU for WebRTC audio mixing and server-side egress recording, Grammy for Telegram bot.
- **Admin Panel (`admin/`)**: React 19, TypeScript, Vite, Tailwind CSS / Cyberpunk design system, single-use Telegram 2FA token authentication + Master Password OTP exchange + 1h HS256 JWT session.
- **Telegram Mini App Client (`client/`)**: React 19, TypeScript, Vite, Tailwind CSS v4, Telegram WebApp SDK, LiveKit client SDK, Socket.IO client.

```
+-----------------------------------------------------------------------------------+
|                                  Telegram Client                                  |
|            (Grammy Bot /start, /admin, menu, inline keyboards, invoices)          |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                                Express HTTP Server                                |
|  - Security Headers (nosniff, XSS-0, HSTS, strict CORS, X-Telegram-Init-Data)    |
|  - Rate Limit Matrix Middleware (IP & Telegram ID)                                |
|  - Global BigInt JSON serialization guard                                         |
+---------------------+-------------------+-------------------+---------------------+
                      |                   |                   |
                      v                   v                   v
             /api/auth (R7, R8)   /api/calls (R9, R10)   /api/admin (R2-R6)
                      |                   |                   |
+---------------------+-------------------+-------------------+---------------------+
|                                Core Service Layer                                 |
|  - matchmaking.ts (O(1) Redis queues, priority tiers, complementary skill match)  |
|  - plan.ts (Authoritative entitlements, refund eligibility rule enforcement)      |
|  - moderation.ts (Penalty ladder: 1-2 Warn, 3-4 Temp Ban 6h, 5+ Perm Lock)       |
|  - referralService.ts (Inviter bonus calls, Hall of Fame leaderboard & prizes)    |
|  - announcement.ts (Rate-limited resilient broadcast engine with dedup locks)     |
|  - storage.ts & s3Storage.ts (Safe path resolution, retention purges)             |
+------------------------------------------+----------------------------------------+
                                           |
                   +-----------------------+-----------------------+
                   |                                               |
                   v                                               v
+------------------------------------+           +------------------------------------+
|          PostgreSQL Database       |           |            Redis Store             |
|  - User, CallSession, CallRating   |           |  - Matchmaking Buckets (SADD/SPOP) |
|  - StarsTx, ManualPaymentRequest   |           |  - Rate Limits & In-Flight Locks   |
|  - UnblockAppeal, Contest, Rewards |           |  - Admin OTP Challenges (5m TTL)   |
|  - AuditLog                        |           |  - Deduplication Locks             |
+------------------------------------+           +------------------------------------+
```

---

## Feature Inventory
Every requirement from the user request and survey is enumerated below with its assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1: Global Minimal Cyberpunk UI & Typography | Dark Cyberpunk palette, bold technical typography, reduced-motion accessibility, purge decorative emojis across WebApp and Admin | M2, M3 | ORIGINAL_REQUEST §R1 |
| 2 | R2: Collapsible Admin Nav & 99+ Badges | Collapsible desktop rail, text-only section labels (no icons), hairline group dividers, dynamic 99+ badges for Payments & Appeals | M2 | ORIGINAL_REQUEST §R2 |
| 3 | R3: Minimal Admin Overview & Telemetry | Streamlined 3 metrics (Total Users, MAU, All-time Users) + user registration growth trend chart | M2 | ORIGINAL_REQUEST §R3 |
| 4 | R4: Championship Lifecycle & Idempotent Prizes | Strict 3-state lifecycle (No active, Active, Ended - no pause), 4-step wizard, live countdown, atomic idempotent prize distribution, deduplicated broadcasts | M1, M2 | ORIGINAL_REQUEST §R4 |
| 5 | R5: Complete Plan Specs & Server-Enforced Refund Policy | Display paid plans only (PLUS, PRO, BOSS; exclude FREE), exhaustive specs, server-enforced refund (<10% credits OR <2 days) with explicit rejection reason | M1, M3 | ORIGINAL_REQUEST §R5 |
| 6 | R6: Streamlined Candidates Administration | 4-column main table (Alias, TG ID, Plan, Scores) + 3 dedicated panels (Limits, Plan, Status) with confirmation modals | M2 | ORIGINAL_REQUEST §R6 |
| 7 | R7: Deterministic WebApp Access-Control Pipeline | 5-step validation pipeline (Context -> RateLimit -> Status -> Quota -> Grant), dedicated screens for External, Banned, Suspended (timer), Rate-limited (timer), Exhausted Quota (CTA) | M1, M3 | ORIGINAL_REQUEST §R7 |
| 8 | R8: High-Density Compact Profile & Whole-Band Scoring | Locked Alias, whole-band criteria (5, 6, 7, 8, 9 only - no half-bands), plan expiry/reset date, usage stats, DND toggle across WebApp, Bot, and Server | M1, M3 | ORIGINAL_REQUEST §R8 |
| 9 | R9: Content Expansion & Data Hygiene | Full Community Guidelines & Privacy Policy, recent transactions strictly capped at 5, valid/accessible recordings filter | M1, M3 | ORIGINAL_REQUEST §R9 |
| 10 | R10: End-to-End Server-Side Security & Zero Client Trust | Zero client trust, `prisma.$transaction` atomicity on state changes, canonical error sanitization | M1 | ORIGINAL_REQUEST §R10 |
| 11 | Final Verification & Quality Gate | All 27 backend Vitest test suites (243 tests) pass with 0 failures; Server, Client, and Admin TypeScript builds compile cleanly | M4 | ORIGINAL_REQUEST Acceptance Criteria |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend, Security & Bot Core | Championship lifecycle & atomic prize distribution, server-enforced refund rules, whole-band scoring (5,6,7,8,9), 5-transaction cap, zero-trust security & transactions | none | DONE |
| M2 | Admin Panel & Moderation | Minimal Cyberpunk UI, collapsible text-only navigation, 99+ dynamic badges, 3-metric overview & growth chart, 4-step championship wizard, 4-column candidate table with Limits/Plan/Status panels | M1 | DONE |
| M3 | WebApp Client & Access Control | Fix Hook rules in App.tsx, Cyberpunk styling & reduced-motion, paid-only PlansModal, 8-variant LockdownScreen, compact ProfileModal, whole-band scoring | M1 | DONE |
| M4 | Final Integration, Test Suites & Build Gate | Verify all 27 backend Vitest test suites (243 tests) pass 100%, and compile all 3 packages (Server, Client, Admin) with 0 TypeScript/Vite errors | M1, M2, M3 | DONE |

---

## Interface Contracts

### 1. Championship Lifecycle & Prize API (`server` ↔ `admin` / `bot`)
- `GET /api/admin/contest`: Returns `{ state: 'NO_ACTIVE' | 'ACTIVE' | 'ENDED', contest: { id, title, description, prizes, startsAt, endsAt, prizesAwarded }, leaderboard: Array<{ rank, userId, alias, score }>, history: Array<Contest> }`
- `POST /api/admin/contest`: Body `{ title: string, description: string, prizes: { rank1: string, rank2: string, rank3: string }, durationDays: number }` -> Creates and starts championship.
- `POST /api/admin/contest/conclude`: Concludes championship, executes atomic `prisma.$transaction` awarding 1st, 2nd, 3rd place prizes idempotently, marks `prizesAwarded: true`, and broadcasts conclusion notice.

### 2. Server-Enforced Refund API (`server` ↔ `admin` / `bot`)
- `POST /api/admin/payments/stars/:id/refund`:
  - Validates `(callsUsed < callLimit * 0.10) || (Date.now() - purchaseDate.getTime() < 48 * 3600 * 1000)`.
  - If ineligible: Rejects with 400 Bad Request and message: `"Refund rejected: User has utilized X of Y calls (>=10%) and purchase was made Z days ago (>2 days)."`.
  - If eligible: Executes inside `prisma.$transaction`, reverts plan to `FREE`, marks StarsTx as `REFUNDED`, records audit log.

### 3. WebApp Verification & Access Pipeline (`server` ↔ `client`)
- `POST /api/auth/verify`: Header `x-telegram-init-data: <rawInitData>`
  - Evaluates 5 gates: HMAC signature -> Rate Limit -> Account Status (Banned/Suspended) -> Quota.
  - Returns `{ valid: true, user: { userId, alias, band, subFC, subLR, subGRA, subP, plan, callsRemaining, totalCallsLimit, bannedUntil, isPermanentlyBanned, dnd } }` OR explicit error status with reason code (`banned`, `suspended`, `rate_limited`, `exhausted_quota`, `browser_direct`, `telegram_no_initdata`, `auth_rejected`).

### 4. IELTS Scoring Contracts
- Criterion scores: `subFC, subLR, subGRA, subP` $\in \{5, 6, 7, 8, 9\}$ (Integer).
- Overall band calculation: `Math.round(((FC + LR + GRA + P) / 4) * 2) / 2` (Standard IELTS rounding).

---

## Code Layout
- `server/src/`:
  - `bot/`: Telegram bot commands and menus (`start.ts`, `menu.ts`, `callbacks.ts`, `payments.ts`, `bot.ts`)
  - `routes/`: Express API endpoints (`admin.ts`, `auth.ts`, `calls.ts`)
  - `services/`: Business logic (`plan.ts`, `moderation.ts`, `referralService.ts`, `announcement.ts`, `matchmaking.ts`, `storage.ts`)
  - `middleware/`: Security and rate limits (`initDataLockdown.ts`, `rateLimitMatrix.ts`, `adminAuth.ts`)
  - `types/`: Canonical types and error sanitization (`canonical.ts`)
  - `__tests__/`: All 27 Vitest test suites
- `admin/src/`:
  - `App.tsx`: Collapsible navigation, dynamic 99+ notification badges, tab routing
  - `components/dashboard/`: `OverviewDashboard.tsx`, `UserManagement.tsx`, `ContestManagement.tsx`, `PlanEditor.tsx`, `ManualPaymentsQueue.tsx`, `AppealsQueue.tsx`, `AnalyticsOverview.tsx`
  - `components/ui/`: `ConfirmDialog.tsx`, `StatusBadge.tsx`, `Toast.tsx`
  - `index.css`: Cyberpunk tokens, `@media (prefers-reduced-motion: reduce)`
- `client/src/`:
  - `App.tsx`: Clean routing, hook rules compliance, WebApp state machine
  - `components/`: `ActiveCallScreen.tsx`, `RadarScreen.tsx`, `LockdownScreen.tsx`, `PlansModal.tsx`, `ProfileModal.tsx`, `GuidelinesScreen.tsx`, `PrivacyScreen.tsx`, `AudioVisualizer.tsx`
  - `types/`: `LockdownReason`, `UserMatchData`
