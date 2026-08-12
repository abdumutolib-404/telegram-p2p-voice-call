# Original User Request

## 2026-08-11T14:28:32Z

<USER_REQUEST>
# Teamwork Project Prompt: IELTS Speaking P2P Partner Match & Voice Call

An enterprise-grade, high-performance Telegram Bot + Ultra-Minimal Mini App platform designed for IELTS students to practice Speaking test sessions via Peer-to-Peer Voice Calling with strict complementary skill matchmaking, automated scaled moderation, native Telegram Stars subscriptions, server-side audio recording, and a secure Web Admin Panel.

Working directory: D:\telegram-p2p-voice-call
Integrity mode: development

## Requirements

### R1. Telegram Bot Core & Menu Interface
- The Telegram Bot must implement only two top-level slash commands: `/start` (public/free onboarding) and `/admin` (stealth 2FA access).
- The bot must provide interactive main menu buttons with Telegram formatting & emojis:
  - 📞 **Find Partner**: Launches Mini-app for matchmaking.
  - 👤 **Profile**: View/edit sub-scores (FC, LR, GRA, P), view permanent alias, view plan status, toggle DND.
  - 📁 **Recordings**: Browse and listen to past practice session audio recordings.
  - ⭐ **Plans**: Upgrade to Plus/Pro via native Telegram Stars invoices.
  - 📞 **Direct Call**: Initiate direct calls to Favorite Partners.
  - 💬 **Support**: Get help and submit feedback.
- Post-call review messages sent to Telegram chat must allow rating **audio call quality** (1-5 stars) and reporting bad partners.

### R2. Ultra-Minimal Telegram Mini App
- The Mini App serves strictly for Matchmaking & Voice Calls.
- **Matchmaking Radar Screen**: Animated loader, instant cancellation button.
- **Active Voice Call Screen**: Displays partner alias, live timer, dynamic audio visualizer waveform, `[ 🎙️ Record: ON/OFF ]` toggle, and `[ 🔴 Finish Call ]` button.

### R3. Web Admin Panel & Stealth Security
- Stealth `/admin` command: returns unrecognized command response for regular users; sends one-time secret admin link to authorized Telegram IDs.
- Master Password prompt (2FA) before issuing session token.
- Mini App WebApp Lockdown: Blocks direct non-Telegram browser access (403 Forbidden).
- Admin Panel features: Total Users + MAU stats, monthly/total Telegram Stars revenue analytics, dynamic plan limits & price editor, and Unblock Appeals review queue.

### R4. Core Engine & Technical Resilience
- Strict Complementary Matchmaking Algorithm ($O(1)$ Redis bucketized queue).
- LiveKit SFU WebRTC + Server-Side Egress Recording (robust audio mixing with headphones, no client OOM).
- Automated scaled moderation penalty ladder (Warning -> 6h Block -> Permanent Lock).
- Full fault tolerance against rate limits (Telegram Bot API 429), race conditions, socket leaks, and storage inflation.

## Acceptance Criteria

### Functionality & User Experience
- [ ] Onboarding captures FC, LR, GRA, P sub-scores and permanently locks a unique plain text alias.
- [ ] Main menu buttons (Find Partner, Profile, Recordings, Plans, Direct Call, Support) work seamlessly.
- [ ] Post-call summary card correctly rates call audio quality (1-5 stars) and offers recording access & reporting.
- [ ] Mini App only renders Matchmaking Radar and Minimal Call Interface.
- [ ] Stealth `/admin` command authentication works with master password 2FA and blocks direct web browser access.

### Performance & Edge Cases
- [ ] Handles mixed-plan calls by granting the higher plan's call duration limit.
- [ ] Robust server-side audio recording captures both voices cleanly (including headphone users).
- [ ] Rate-limited outgoing Telegram notifications with automatic retry queues.
- [ ] Automated daily storage cleanup task purges expired audio files (1 day / 7 days / 30 days).

Please divide the execution into three main parts: **Frontend**, **Backend**, and **Admin Panel**. Execute the cycle of writing code, testing, and debugging, uncovering and fixing every flaw, edge case, vulnerability, and bug.

</USER_REQUEST>

## 2026-08-12T09:57:31Z

<USER_REQUEST>
# Teamwork Project Prompt: IELTS Speaking P2P Partner Match & Voice Call

An enterprise-grade, high-performance Telegram Bot + Ultra-Minimal Mini App platform for IELTS students to practice Speaking test sessions via Peer-to-Peer Voice Calling.

Working directory: D:\telegram-p2p-voice-call
Integrity mode: development

## Requirements

### R1. Telegram Bot Core & Command Handlers
- Verify and fix all Telegram Bot command handlers (/start, /admin) and menu options (📞 Find Partner, 👤 Profile, 📁 Recordings, ⭐ Plans, 📞 Direct Call, 💬 Support).
- Ensure onboarding captures sub-scores (FC, LR, GRA, P), calculates overall band, and locks a unique alias.
- Ensure stealth /admin command returns unrecognized command for unauthorized users and sends an Inline WebApp button for authorized Telegram IDs.

### R2. Post-Call Evaluation & Direct Call Workflow
- Post-call review card must allow 1-5 star audio quality rating, partner reporting, saving partner to favorites, and native audio recording delivery.
- Direct Call menu must list saved favorites and send ringing notification with an inline [ Accept & Join Call ] button that creates a session and connects both partners.

### R3. Payments & Admin Security
- Telegram Stars payments for PLUS/PRO upgrades must handle pre-checkout query validation and idempotent transaction creation.
- Web Admin Panel authentication must enforce master password validation, single-use 2FA token exchange, rate limiting, and algorithm pinning (HS256).

### R4. Core Engine, WebSockets & LiveKit Audio
- Socket.IO handshake must enforce initData signature validation and bind verified database UUID server-side.
- LiveKit SFU WebRTC token generation must be properly awaited and egress recordings saved with exact relative disk paths.

## Acceptance Criteria

### Functionality & Reliability
- [ ] Onboarding flow correctly calculates overall band and locks unique alias without race conditions.
- [ ] Post-call review card handles ratings, reporting, favoriting, and native audio delivery without error.
- [ ] Direct Call flow allows calling saved favorites and accepting calls smoothly.
- [ ] All 22 backend Vitest unit & integration tests pass with 0 failures (npm run test).
- [ ] Client Mini App and Admin Panel build with 0 TypeScript/Vite errors (npm run build).

</USER_REQUEST>
