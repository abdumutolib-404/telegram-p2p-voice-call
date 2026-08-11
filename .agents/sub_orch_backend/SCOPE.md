# Scope: Milestone M1 — Backend Core Engine

## Objectives
Implement, build, unit test, and verify the complete backend server in `D:\telegram-p2p-voice-call\server`.

## Specific Requirements to Fulfill
1. **Telegram Bot Core & Menu (`grammy`)**:
   - `/start` command (captures FC, LR, GRA, P sub-scores & locks plain text alias).
   - Stealth `/admin` command (checks admin Telegram ID; returns unrecognized command for non-admins, issues 1-time 2FA login link for authorized admin).
   - Interactive menu buttons: 📞 Find Partner, 👤 Profile (view/edit sub-scores, plan status, DND toggle), 📁 Recordings (listen to past session audio), ⭐ Plans (Telegram Stars payment invoices), 📞 Direct Call (favorite partners), 💬 Support.
   - Post-call review message: audio call quality rating (1-5 stars), recording link, report partner button.
2. **Complementary Matchmaking Engine ($O(1)$ Redis Bucket Queue)**:
   - Match users by complementary weak/strong sub-scores within target band brackets.
   - Fast $O(1)$ queue operations & instant cancellation support.
3. **LiveKit SFU & Audio Egress Recording**:
   - LiveKit room token generation API.
   - Server-side dual-voice audio recording egress with headphone support.
   - Daily storage cleanup cron task purging expired audio files (Free: 1 day, Plus: 7 days, Pro: 30 days).
4. **Moderation Penalty Ladder**:
   - Automated escalation: 1st report -> Warning; 2nd report -> 6-hour temporary ban; 3rd report -> Permanent lock.
5. **Telegram Stars Payments**:
   - Invoice generation, `pre_checkout_query`, and `successful_payment` handlers.
6. **Mixed-Plan Call Duration**:
   - Call limit calculation granting the higher plan's limit ($\max(limit_A, limit_B)$).
7. **Mini App WebApp Lockdown Middleware**:
   - Validates Telegram `initData` HMAC-SHA256 signature; returns HTTP `403 Forbidden` for direct web browser access.

## Target File Structure
- `server/package.json`
- `server/src/index.ts`
- `server/src/config/` (env, database, redis, livekit)
- `server/src/bot/` (bot, middleware, handlers: start, admin, profile, recordings, plans, direct_call, support, notifications)
- `server/src/services/` (matchmaking, livekit, moderation, analytics, storage)
- `server/src/middleware/` (auth/initData lockdown, admin JWT)
- `server/src/routes/` (auth, match, calls, admin)
- `server/src/socket/` (signaling)

## Verification Criteria
- `npm run build` (`tsc`) succeeds with zero errors in `server/`.
- All features verified via unit/integration tests and reported in `handoff.md`.
