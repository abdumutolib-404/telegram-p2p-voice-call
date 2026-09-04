# PairTalk Engineering Improvement Plan & Implementation Specification

## Executive Overview
This document specifies the architectural improvements, security hardening, external API compliance, database query optimizations, and SEO upgrades for the PairTalk Telegram P2P IELTS Speaking platform. The objective is to elevate the platform to top-tier enterprise quality without introducing extraneous features—focusing entirely on strengthening, securing, and refining existing capabilities.

---

## 1. Security Hardening & P0 Criticals

### 1.1 Telegram Stars Payment Guard Clauses
- **Problem**: In `server/src/bot/bot.ts`, rate-limiting and suspension middlewares process incoming updates indiscriminately. If a user triggers a rapid tap or has a pending moderation flag when purchasing Telegram Stars, `pre_checkout_query` (<10-second timeout) or `message:successful_payment` updates could be delayed, rate-limited, or blocked, resulting in dropped payments and stranded Stars charges.
- **Solution**: Inject immediate guard clauses at the entry point of both the rate-limiting middleware and the suspension middleware in `server/src/bot/bot.ts`:
  ```typescript
  if (ctx.preCheckoutQuery || ctx.message?.successful_payment) {
    return next();
  }
  ```
- **Impact**: Zero dropped payment webhooks, guaranteed strict compliance with Telegram Stars SLA.

### 1.2 LiveKit Access Token TTL Ceiling Extension
- **Problem**: `server/src/config/livekit.ts` enforces `ttlSeconds <= 3600` (1 hour) and `server/src/socket/signaling.ts` clamps token TTL to `Math.min(3600, ...)`. BOSS tier subscribers are entitled to 90-minute (5400s) continuous voice sessions. During ICE renegotiation or reconnection after minute 60, token validation fails with a `RangeError`, prematurely terminating legitimate paid sessions.
- **Solution**:
  - In `server/src/config/livekit.ts`: Raise the token TTL ceiling from 3600s to 7200s (2 hours): `ttlSeconds > 7200`.
  - In `server/src/socket/signaling.ts` and `server/src/routes/calls.ts`: Update token TTL ceiling clamping from `Math.min(3600, ...)` to `Math.min(7200, ...)`.
- **Impact**: Uninterrupted 90-minute calls for BOSS tier users with seamless ICE renegotiation.

### 1.3 Authoritative Server Session Teardown on Direct Voice Calls
- **Problem**: When candidates accept direct calls via the Telegram bot callback (`accept_direct`), the `CallSession` status is updated to `ACTIVE`, but no authoritative duration teardown timer is instantiated on the server. If both clients disconnect or keep the audio room open past entitlement boundaries, the session leaks server resources and never concludes.
- **Solution**:
  - Export `scheduleAuthoritativeSessionTeardown(roomName, callDurationLimitSeconds, botInstance?, ioInstance?)` from `server/src/socket/signaling.ts`.
  - In `server/src/bot/handlers/callbacks.ts`: Call this helper upon successful call acceptance to instantiate the timer and register it in `serverSessionTimers`.
- **Impact**: Authoritative duration enforcement across all call entry paths (matchmaking and direct invitations).

### 1.4 Hardened Credit Card PII Redaction
- **Problem**: `server/src/utils/logger.ts` used a broad digit pattern `\b(?:\d[ -]*?){13,19}\b`, causing false-positive redactions on 13-digit Unix millisecond timestamps (e.g. `1725436800000`) and numeric UUID segments in server logs.
- **Solution**: Refine the credit card PII regex pattern to require valid payment card prefix patterns (Visa `4`, Mastercard `51-55`/`22-27`, Amex `34`/`37`, Discover `6011`/`65`, Uzcard `8600`, Humo `9860`, etc.) and isolate them with boundary lookarounds `(?<![a-zA-Z0-9_-])` and `(?![a-zA-Z0-9_-])`.
- **Impact**: Preserves forensic timestamps and UUIDs in logs while reliably redacting actual cardholder PAN numbers.

---

## 2. External App Limits, Crawler Politeness & Telegram API Respect

### 2.1 Domain-Level Rate Limiting & Polite Web Crawler Delays
- **Problem**: The question crawler in `server/src/services/crawler/webCrawlerService.ts` crawled targets with minimal delays, risking IP blocking, HTTP 429 rate-limiting, and unnecessary load on partner educational sites.
- **Solution**:
  - Implement per-domain last-request timestamp tracking with a polite spacing delay (750ms between requests to the same target domain).
  - Enforce concurrency caps per domain (1 request at a time per host).
  - Add exponential backoff on HTTP 429 and 503 responses, respecting `Retry-After` headers if present.
- **Impact**: Polite, non-intrusive scraping respecting external site resource limits and avoiding IP bans.

### 2.2 Prioritized Telegram Notification Queue
- **Problem**: `NotificationQueue` in `server/src/bot/notifications.ts` used a single FIFO queue. During marketing broadcasts or bulk reminders, post-call review cards were trapped behind hundreds of broadcast messages.
- **Solution**: Upgrade `NotificationQueue` to support prioritized dispatch: urgent notifications (e.g. post-call review cards) are placed ahead of bulk marketing broadcasts and dispatched immediately within Telegram's 30 msgs/sec global limit.
- **Impact**: Immediate post-call UX delivery regardless of background marketing load.

---

## 3. Performance, Latency & Database Optimization

### 3.1 Composite Prisma Indexes
- **Problem**: High-traffic queries on audit logs, appeals, payment requests, referral rewards, and call sessions caused sequential table scans.
- **Solution**: Add composite database indexes in `server/prisma/schema.prisma`:
  - `UnblockAppeal`: `@@index([status, createdAt])`, `@@index([userId])`
  - `AuditLog`: `@@index([action, createdAt])`, `@@index([targetId])`
  - `ManualPaymentRequest`: `@@index([status, createdAt])`
  - `ReferralReward`: `@@index([createdAt])`
  - `CallSession`: `@@index([status, recordingUrl, createdAt])`
  - Run `npx prisma generate`.
- **Impact**: Sub-millisecond indexed lookup latency for administrative queries and background cleanup workers.

### 3.2 Prisma Connection Pool Optimization
- **Problem**: Default Prisma connection pool settings can cause pool starvation during concurrent matchmaking surges or slow query spikes.
- **Solution**: Configure database connection URL parameters explicitly with `connection_limit=20&pool_timeout=10` in `server/src/config/database.ts`.
- **Impact**: Stable database connection throughput under high load.

### 3.3 LRU In-Memory Session Eviction
- **Problem**: `memorySessions` in `server/src/bot/bot.ts` grew without bounds when Redis was unavailable or during long-running sessions, causing memory leaks.
- **Solution**: Implement LRU cache eviction with max capacity (5,000 sessions) and a 7-day TTL timestamp bound.
- **Impact**: Stable resident memory usage and leak prevention.

---

## 4. Billing, Quota Fairness & UX Accuracy

### 4.1 Subscription Tier Upgrades
- **Problem**: Active subscribers were blocked from purchasing higher tiers (e.g. PLUS wishing to upgrade to PRO or BOSS), receiving an error that they must wait for the current plan to expire.
- **Solution**: In `server/src/bot/handlers/payments.ts`: Allow active subscribers to upgrade to higher tiers (`!isDowngrade(profile.plan, tier)`), rejecting only duplicate tiers (`profile.plan === tier`) and downgrades (`isDowngrade(profile.plan, tier)`).
- **Impact**: Better customer monetization, frictionless user upgrade path.

### 4.2 Dropped Call Quota Fairness & Disconnect Timestamping
- **Problem**: When a call disconnected after 1 second, the 15-second grace timer ran before evaluating duration, calculating `duration = createdAt + 16s = 16s` and consuming a monthly call credit.
- **Solution**: In `server/src/socket/signaling.ts`: Record `disconnectTimestamp = Date.now()` at the moment of socket disconnection. In the grace timer, calculate duration against `disconnectTimestamp`. If duration is under 5 seconds, mark session `CANCELLED` instead of `COMPLETED` and do not deduct call credits.
- **Impact**: Prevents unfair consumption of user credits due to immediate connection drops.

### 4.3 Authentic IELTS Half-Band Score Preservation
- **Problem**: `client/src/App.tsx` rounded band scores to integers (`Math.round(...)`), stripping authentic IELTS half-band scores (e.g. 6.5, 7.5).
- **Solution**: Use `Math.round(score * 2) / 2` to preserve authentic IELTS half-band granularity.
- **Impact**: Accurate candidate band representation.

### 4.4 IELTS Topic Filtering by UUID or Slug
- **Problem**: `server/src/routes/ielts.ts` filtered questions only by `where.topicId = topicId`, failing when clients or crawlers passed a topic slug.
- **Solution**: Update to `where.OR = [{ topicId }, { topic: { slug: topicId } }]`.
- **Impact**: Seamless querying by both database UUIDs and human-readable slugs.

### 4.5 Live Audio Waveform Visualization
- **Problem**: `client/src/hooks/useLiveKit.ts` did not link remote audio streams to an `AnalyserNode`, leaving the audio visualizer inactive.
- **Solution**: In `attachAudioTrack`, connect the remote `MediaStream` to a Web Audio `AnalyserNode` and pass it to React state.
- **Impact**: Rich, responsive audio waveforms during live conversations.

---

## 5. Top-Tier SEO Enhancement

### 5.1 Client Index Robots Tag Correction
- **Problem**: `client/index.html` contained `<meta name="robots" content="noindex, nofollow" />`, blocking search engine indexing.
- **Solution**: Replace with:
  ```html
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  ```

### 5.2 Schema.org JSON-LD Completeness
- **Solution**: Ensure both `client/index.html` and `server/src/index.ts` include the full suite of schema.org nodes: `WebSite`, `SoftwareApplication`, `EducationalOrganization`, and `FAQPage`.
- **Impact**: Maximum search engine visibility, rich snippets, and social preview cards.

---

## 6. Crawler Sanitation

### 6.1 Linear Non-Greedy HTML Sanitization
- **Problem**: `webCrawlerService.ts` used regex with nested quantifiers susceptible to ReDoS.
- **Solution**: Replace with linear non-greedy matching: `/<script\b[\s\S]*?<\/script>/gi` and `/<style\b[\s\S]*?<\/style>/gi`.

### 6.2 Graceful Duplicate Collision Handling in Question Filter
- **Problem**: In `questionFilterService.ts` Pass A, updating `sourceHash` on cleaned questions could throw a Prisma `P2002` unique constraint violation.
- **Solution**: Wrap the update in a try/catch block to handle `P2002` collisions gracefully by removing the duplicate or skipping the update.
