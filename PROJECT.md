# Project: IELTS Speaking P2P Partner Match & Voice Call

## Architecture

The system consists of three main applications and a supporting test suite:
1. **Backend Server (`server/`)**: Express API, Grammy Telegram Bot, Redis Bucketized $O(1)$ Complementary Matchmaking Queue, LiveKit SFU Room & Egress Recording Service, Moderation Penalty Ladder Engine, Telegram Stars Invoicing & Payment Webhooks, and Daily Storage Purge Cron Job.
2. **Frontend Mini App (`client/`)**: Telegram Mini App (React + Vite + LiveKit JS SDK + Socket.io Client) for Radar Matchmaking and Active Voice Calling (Live Call Timer, Dynamic Web Audio API Waveform Visualizer, Record Toggle, Finish Call Button, and Telegram WebApp `initData` Lockdown).
3. **Web Admin Panel (`admin/`)**: Enterprise Web Dashboard (React + Vite) for Stealth `/admin` 2FA Access, Total Users / MAU Analytics, Telegram Stars Revenue Analytics, Dynamic Plan Limits & Pricing Editor, Unblock Appeals Queue, and User Management.
4. **E2E Testing Track (`test/` or root runner)**: Independent requirement-driven opaque-box test suite (Tiers 1–4) and white-box adversarial coverage hardening (Tier 5).

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Onboarding & Sub-scores | `/start` command captures FC, LR, GRA, P sub-scores and locks plain text alias | M1 (Backend) | R1 / R4 |
| 2 | Telegram Interactive Menu | Telegram menu buttons: Find Partner, Profile, Recordings, Plans, Direct Call, Support | M1 (Backend) | R1 |
| 3 | Post-Call Rating & Reports | Bot message rates audio quality (1-5 stars), access recordings & report partner | M1 (Backend) | R1 |
| 4 | Complementary Matchmaking | $O(1)$ Redis bucketized queue matching weak/strong IELTS sub-scores & target bands | M1 (Backend) | R4 |
| 5 | LiveKit SFU & Audio Egress | LiveKit room token issue & server-side audio recording egress (headphones support) | M1 (Backend) | R4 |
| 6 | Moderation Penalty Ladder | Auto escalation: 1st report -> Warning, 2nd -> 6h Block, 3rd -> Permanent Lock | M1 (Backend) | R4 |
| 7 | Storage Cleanup Cron | Daily purge task enforcing retention: Free (1 day), Plus (7 days), Pro (30 days) | M1 (Backend) | Edge Cases |
| 8 | Telegram Stars Payments | Native Telegram Stars invoicing & webhook processing (`pre_checkout`, `successful_payment`) | M1 (Backend) | R1 |
| 9 | Mini App Radar Screen | Concentric animated radar waves, queue state loader, instant cancel button | M2 (Frontend) | R2 |
| 10 | Active Voice Call Screen | Partner alias display, live call timer (MM:SS), record ON/OFF toggle, finish call button | M2 (Frontend) | R2 |
| 11 | Dynamic Audio Visualizer | Canvas rendering real-time Web Audio API frequency waveform from LiveKit stream | M2 (Frontend) | R2 |
| 12 | Mini App WebApp Lockdown | Block direct web browser access (403 Forbidden) by validating Telegram `initData` HMAC | M2 (Frontend) / M1 (Backend) | R3 |
| 13 | Stealth `/admin` 2FA Auth | Stealth command issuing 1-time 2FA login link + Master Password JWT token exchange | M3 (Admin) / M1 (Backend) | R3 |
| 14 | Admin Analytics Dashboard | Total Users, MAU/DAU, Total Active Calls, Monthly & Total Telegram Stars Revenue | M3 (Admin) | R3 |
| 15 | Dynamic Plan & Price Editor | Form to update tier call duration limits, daily call limits, retention days & Stars pricing | M3 (Admin) | R3 |
| 16 | Unblock Appeals Queue | Moderation queue to view ban details, appeal text, and approve unblock or reject appeal | M3 (Admin) | R3 |
| 17 | Mixed-Plan Call Duration | Grant higher plan's call duration limit in mixed-plan partner calls | M1 (Backend) / M2 (Frontend) | Edge Cases |
| 18 | E2E Test Suite & Hardening | Complete Tier 1-4 test suite & Tier 5 white-box adversarial coverage hardening | M4 (E2E Track) | Acceptance |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Core Engine | Telegram Bot (`grammy`), Express REST & Socket.io, Redis Matchmaking, LiveKit SFU + Audio Egress, Moderation Ladder, Stars Payments, Daily Storage Purge | None | PLANNED |
| M2 | Frontend Mini App | Telegram Mini App (React + LiveKit JS + Socket.io), Matchmaking Radar, Active Call UI, Waveform Visualizer, Record Toggle, WebApp Lockdown | M1 | PLANNED |
| M3 | Admin Panel | Web Admin Dashboard (React), Stealth `/admin` 2FA exchange, Analytics, Plan & Pricing Editor, Unblock Appeals Queue | M1 | PLANNED |
| M4 | E2E Testing & Hardening | Requirement-driven opaque-box E2E test suite (Tiers 1-4) & adversarial coverage hardening (Tier 5) | M1, M2, M3 | PLANNED |

---

## Interface Contracts

### 1. Mini App ↔ Backend API & Socket Contracts

- **Authentication**:
  - Mini App passes `window.Telegram.WebApp.initData` in HTTP Header `X-Telegram-Init-Data`.
  - Middleware verifies HMAC-SHA256 signature using `BOT_TOKEN`. Invalid or missing `initData` -> HTTP `403 Forbidden`.

- **Socket.io Events**:
  - `join_queue`: Payload `{ userId, band, weakSkill, strongSkill }` -> Backend adds user to Redis bucket `match_queue:<band>:<weak>:<strong_skill>`.
  - `cancel_queue`: Payload `{ userId }` -> Backend removes user from Redis bucket instantly ($O(1)$).
  - `match_found`: Server emits `{ roomName, livekitToken, partnerAlias, partnerBand, callDurationLimit }`.
  - `toggle_record`: Payload `{ roomName, record: boolean }` -> Server toggles LiveKit egress recording. Emits `record_status` `{ record: boolean }`.
  - `finish_call`: Payload `{ roomName, userId }` -> Disconnects session, stops egress recording, sends post-call review message to both Telegram chats.

### 2. Admin Panel ↔ Backend API Contracts

- **Stealth 2FA Authentication**:
  - `POST /api/admin/login`: Payload `{ token, masterPassword }` -> Returns `{ jwtToken, expiresAt }`.
  - All admin endpoints require Header `Authorization: Bearer <jwtToken>`.

- **Admin Management Endpoints**:
  - `GET /api/admin/stats`: Returns `{ totalUsers, mau, dau, activeCalls, starsRevenue: { totalStars, totalUsd, monthlyHistory } }`.
  - `GET /api/admin/plans` / `PUT /api/admin/plans`: View/Update dynamic tier settings `{ free: { maxDuration, dailyLimit, retentionDays }, plus: { maxDuration, dailyLimit, retentionDays, starsPrice }, pro: { ... } }`.
  - `GET /api/admin/appeals`: Returns pending appeals list `[{ id, userId, alias, telegramId, subscores, banReason, appealText, createdAt }]`.
  - `POST /api/admin/appeals/:id/approve` & `POST /api/admin/appeals/:id/reject`: Resolves unblock appeal.

---

## Code Layout

### Backend (`D:\telegram-p2p-voice-call\server`)
- `src/index.ts`: Entry point (Express + Socket.io + Cron)
- `src/config/`: Environment, SQLite/Prisma database, Redis client, LiveKit client
- `src/bot/`: Grammy Bot instance, handlers (`start`, `admin`, `profile`, `recordings`, `plans`, `direct_call`, `support`), notifications queue
- `src/services/`: Matchmaking ($O(1)$ Redis), LiveKit SFU & Egress, Moderation Ladder, Storage Purge Cron
- `src/middleware/`: Telegram WebApp `initData` validation (403 Lockdown), Admin JWT validation
- `src/routes/`: REST API endpoints for Auth, Match, Calls, and Admin

### Frontend Mini App (`D:\telegram-p2p-voice-call\client`)
- `src/App.tsx`: Main router & Telegram WebApp lockdown guard
- `src/components/LockdownScreen.tsx`: 403 Access Restricted UI
- `src/components/RadarScreen.tsx`: Animated radar wave loader & cancel button
- `src/components/ActiveCallScreen.tsx`: Call UI, live timer, record toggle, finish call button
- `src/components/AudioVisualizer.tsx`: Web Audio API canvas visualizer
- `src/hooks/useLiveKit.ts`: LiveKit SFU client hook
- `src/services/socket.ts`: Socket.io connection manager

### Admin Panel (`D:\telegram-p2p-voice-call\admin`)
- `src/App.tsx`: Layout switcher & auth context guard
- `src/components/auth/LoginModal.tsx`: Stealth 2FA token exchange & password prompt
- `src/components/dashboard/AnalyticsOverview.tsx`: Stats & Telegram Stars revenue charts
- `src/components/dashboard/PlanEditor.tsx`: Tier duration, retention, and price forms
- `src/components/dashboard/AppealsQueue.tsx`: Unblock appeals management
- `src/components/dashboard/UserManagement.tsx`: User search & moderation controls
