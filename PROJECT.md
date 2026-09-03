# Project: PairTalk Production Transformation

## Architecture
PairTalk is an autonomous peer-to-peer IELTS Speaking preparation platform operating across 4 distinct packages and domains:
- **`landing/` (`pairtalk.online`)**: Public authority, marketing, SEO, Schema.org graphs, documentation, and policy surfaces.
- **`client/` (`app.pairtalk.online`)**: Telegram Mini App client for peer-to-peer voice calls, criteria selection, and session controls.
- **`admin/` (`admin.pairtalk.online`)**: Operations control plane, candidate management, appeals center, contest wizard, and audit telemetry.
- **`server/` (`api.pairtalk.online`)**: Backend API, Express HTTP endpoints, Prisma ORM (PostgreSQL), Redis distributed state/locking, Socket.IO signaling, LiveKit SFU voice rooms, and Grammy Telegram Bot.

```
                    ┌──────────────────────────────────────────────┐
                    │               pairtalk.online                │
                    │        (landing/ - Cloudflare Pages)         │
                    │   • Semantic Pre-rendered HTML (AI Bots)     │
                    │   • Schema.org JSON-LD (4-Entity Graph)      │
                    │   • 8 Canonical Routes & Knowledge Docs      │
                    │   • /robots.txt & /sitemap.xml               │
                    └──────────────────────────────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│          app.pairtalk.online         │       │         admin.pairtalk.online        │
│      (client/ - Telegram Mini App)   │       │       (admin/ - Operations Plane)    │
│   • <meta robots="noindex">          │       │   • <meta robots="noindex">          │
│   • Whole-Band 5-9 Controls          │       │   • Live System Health Telemetry     │
│   • WebRTC SFU Audio & In-Call UI    │       │   • Candidate Drawers & Appeals      │
│                                      │       │   • AuditLogViewer & JSON Diffs      │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          │
                    ┌──────────────────────────────────────────────┐
                    │             api.pairtalk.online              │
                    │            (server/ - Railway Node)          │
                    │   • Structured NDJSON Logger & AsyncCtx      │
                    │   • Strict HMAC, 2FA, & Trusted IP Shield    │
                    │   • Whole-Band Matchmaking & Concurrency     │
                    │   • LiveKit Audio Egress & Retention Purge   │
                    │   • Telegram Grammy Bot & Stars Payments     │
                    │   • Domain Isolation: Disallow /             │
                    └──────────────────────────────────────────────┘
```

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | AI Bot & Search Engine Pre-Rendering | Pre-rendered semantic HTML inside `landing/index.html` answering What, Who, Band Rubrics, Anonymity, Pricing | M1 | Survey 1 (R1) |
| 2 | Schema.org 4-Node JSON-LD Graph | Full JSON-LD graph (`WebSite`, `EducationalApplication`, `Organization`, `FAQPage`) with `@id` graph links | M1 | Survey 1 (R1) |
| 3 | Static `robots.txt` & `sitemap.xml` | Authoritative files in `landing/public/` allowing AI bots and referencing 8 canonical URLs without hash anchors | M1 | Survey 1 (R1, R2) |
| 4 | OpenGraph & Twitter Meta Tags | 1200x630 Large summary card, canonical URLs, and social sharing metadata | M1 | Survey 1 (R1) |
| 5 | Domain Responsibility Isolation | `api.pairtalk.online` serves `User-agent: *\nDisallow: /` on robots.txt and 404 on sitemap.xml; `client` & `admin` set `noindex` | M1 | Survey 1 (R2) |
| 6 | Public Knowledge Layer (Markdown) | 5 new docs (`HOW_IT_WORKS.md`, `IELTS_SPEAKING_GUIDE.md`, `SAFETY_GUIDE.md`, `TERMS_OF_SERVICE.md`, `FAQ.md`) + updated guidelines/privacy | M2 | Survey 1 (R3) |
| 7 | Multi-Route Landing Architecture | Router in `landing/src/App.tsx` handling 8 canonical paths with browser history & Telegram back button | M2 | Survey 1 (R3) |
| 8 | 5 Dedicated Documentation Screens | UI components (`HowItWorksScreen`, `IeltsSpeakingGuideScreen`, `SafetyGuideScreen`, `TermsScreen`, `FaqScreen`) | M2 | Survey 1 (R3) |
| 9 | Navigation & 4-Column Footer | Header navigation links to all guides and structured 4-column footer with deep anchor links | M2 | Survey 1 (R3) |
| 10 | Unified Trusted IP Extraction | Replace leftmost header extraction with trusted `extractClientIp` in scanner shield, rate limiter, and logger | M3 | Survey 2 (R4) |
| 11 | HTML Entity Sanitization in Bot | Implement `escapeHtml()` sanitizer for all dynamic user inputs interpolated into Telegram HTML messages | M3 | Survey 2 (R4) |
| 12 | SSRF & Refund Proof Validation | Validate and sanitize manual refund proof URLs against allowed storage domains | M3 | Survey 2 (R4) |
| 13 | Strict Whole-Band IELTS Scoring | Enforce integer whole bands (5, 6, 7, 8, 9) without half-bands in matchmaking, bot commands, admin UI, and schema | M3 | Survey 2 (R5) |
| 14 | Code Hygiene & Any-Casts Elimination | Remove `any` casts in Express routes and plan services, standardize error handling in async callbacks | M3 | Survey 2 (R5) |
| 15 | Centralized Structured Logger | Create `server/src/utils/logger.ts` with levels (debug, info, warn, error, fatal) and NDJSON output in production | M4 | Survey 3 (R6) |
| 16 | Request Correlation (`requestId`) | `AsyncLocalStorage` middleware for HTTP lifecycle and traceId injection for WebSocket signaling | M4 | Survey 3 (R6) |
| 17 | Automated Deep PII Redaction | Recursive redaction of passwords, JWTs, bot tokens, initData, cookies, auth headers, card numbers | M4 | Survey 3 (R6) |
| 18 | Live System Health Telemetry API | Endpoints (`/api/admin/telemetry/health`, `/queue`, `/active-calls`, `/errors`) probing API, DB, Redis, LiveKit, Bot | M5 | Survey 3 (R7) |
| 19 | Live Health & Queue Telemetry UI | Real-time indicators and queue stats in `admin/src/components/dashboard/OverviewDashboard.tsx` | M5 | Survey 3 (R7) |
| 20 | Dedicated Audit Log Viewer UI | Searchable `AuditLogViewer.tsx` component with action filters, before/after JSON diffs, and error tracking | M5 | Survey 3 (R7) |
| 21 | Vitest Suite & Build Verification | Verify all 32 Vitest suites pass and all 4 package builds compile cleanly | M6 | Survey 3 (Acceptance) |
| 22 | Adversarial Coverage Hardening | White-box stress tests for edge routing, race conditions, scoring boundaries, and audit logging | M6 | Survey 2/3 (Tier 5) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Technical SEO & Domain Isolation (R1 + R2) | `landing/index.html`, `landing/public/robots.txt`, `landing/public/sitemap.xml`, `client/index.html`, `admin/index.html`, `server/src/index.ts`, `server/src/config/env.ts` | None | PLANNED |
| M2 | Public Docs & Knowledge Architecture (R3) | `docs/*.md`, `landing/src/App.tsx`, `landing/src/components/*.tsx` | M1 | PLANNED |
| M3 | Security Remediation & Whole-Band Scoring (R4 + R5) | `server/src/middleware/`, `server/src/services/matchmaking.ts`, `server/src/bot/`, `server/src/routes/admin.ts`, `admin/src/components/dashboard/UserManagement.tsx`, `server/prisma/schema.prisma` | None | PLANNED |
| M4 | Structured Observability & Correlation (R6) | `server/src/utils/logger.ts`, `server/src/middleware/requestId.ts`, `server/src/socket/signaling.ts`, `server/src/routes/`, `server/src/index.ts` | None | PLANNED |
| M5 | Operations Control Plane & Admin Telemetry (R7) | `server/src/routes/adminTelemetry.ts`, `server/src/routes/admin.ts`, `admin/src/components/dashboard/AuditLogViewer.tsx`, `admin/src/components/dashboard/OverviewDashboard.tsx`, `admin/src/App.tsx` | M3, M4 | PLANNED |
| M6 | Final Verification & Adversarial Hardening | Full 32 Vitest test suites (307+ tests), 4 package builds compilation, Tier 1-5 E2E & adversarial stress testing | M1, M2, M3, M4, M5 | PLANNED |

---

## Interface Contracts

### 1. Telemetry API Contracts (`server/src/routes/adminTelemetry.ts` ↔ `admin/src/services/api.ts`)
- `GET /api/admin/telemetry/health` -> `{ status: 'ok', api: { uptime: number, memoryMb: number }, database: { status: 'healthy', latencyMs: number }, redis: { status: 'healthy', latencyMs: number }, livekit: { status: 'healthy', activeRooms: number }, bot: { status: 'healthy', polling: boolean, lastUpdateTs: string } }`
- `GET /api/admin/telemetry/queue` -> `{ waitingCount: number, buckets: Record<string, number>, oldestWaitingSec: number }`
- `GET /api/admin/telemetry/active-calls` -> `{ activeCallsCount: number, rooms: Array<{ roomName: string, durationSec: number, userA: string, userB: string, recording: boolean }> }`
- `GET /api/admin/telemetry/errors` -> `{ recentErrors: Array<{ timestamp: string, level: string, message: string, requestId?: string, error?: string }> }`

### 2. Structured Logger Contract (`server/src/utils/logger.ts`)
- `logger.debug(message: string, context?: LogContext)`
- `logger.info(message: string, context?: LogContext)`
- `logger.warn(message: string, context?: LogContext)`
- `logger.error(message: string, context?: LogContext, err?: Error)`
- `logger.fatal(message: string, context?: LogContext, err?: Error)`
- `LogContext`: `{ service?: string, event?: string, userId?: string, requestId?: string, durationMs?: number, [key: string]: any }`

### 3. Whole-Band Scoring Contract
- Sub-scores: `subFC, subLR, subGRA, subP` $\in \{5, 6, 7, 8, 9\}$
- Overall Band: $\text{round}\left(\frac{\text{FC}+\text{LR}+\text{GRA}+\text{P}}{4}\right) \in \{5, 6, 7, 8, 9\}$
- Matchmaking Queue keys: `"5" | "6" | "7" | "8" | "9"`

---

## Code Layout

```
D:\telegram-p2p-voice-call\
├── docs/                                # Public documentation & policy markdown layer (R3)
│   ├── HOW_IT_WORKS.md
│   ├── IELTS_SPEAKING_GUIDE.md
│   ├── COMMUNITY_GUIDELINES.md
│   ├── SAFETY_GUIDE.md
│   ├── PRIVACY_POLICY.md
│   ├── TERMS_OF_SERVICE.md
│   └── FAQ.md
├── landing/                             # Public website & SEO surface (R1, R2, R3)
│   ├── public/
│   │   ├── robots.txt                   # Static search & AI crawler policy
│   │   └── sitemap.xml                  # 8 canonical URLs
│   ├── src/
│   │   ├── App.tsx                      # 8-route history & deep link dispatcher
│   │   └── components/
│   │       ├── LandingPage.tsx          # Nav header & 4-column footer
│   │       ├── HowItWorksScreen.tsx     # How It Works guide
│   │       ├── IeltsSpeakingGuideScreen.tsx # Official Band Descriptors guide
│   │       ├── SafetyGuideScreen.tsx    # Safety & Anti-solicitation guide
│   │       ├── GuidelinesScreen.tsx     # Community guidelines
│   │       ├── PrivacyScreen.tsx        # Privacy & 100% refund policy
│   │       ├── TermsScreen.tsx          # Terms of Service
│   │       └── FaqScreen.tsx            # Standalone FAQ screen
│   └── index.html                       # Pre-rendered HTML & 4-node Schema.org JSON-LD
├── client/                              # Telegram Mini App client (R2, R5)
│   ├── index.html                       # <meta name="robots" content="noindex, nofollow" />
│   └── src/                             # Whole-band 5-9 selection UI
├── admin/                               # Operations Control Plane (R7)
│   ├── index.html                       # <meta name="robots" content="noindex, nofollow" />
│   └── src/
│       ├── App.tsx                      # Navigation menu + Audit Log route
│       └── components/
│           └── dashboard/
│               ├── OverviewDashboard.tsx # Live telemetry health & queue probes
│               ├── UserManagement.tsx   # Whole-band displays & moderation
│               ├── AppealsQueue.tsx     # Unblock appeals with full audit history
│               ├── ContestManagement.tsx # Championship lifecycle wizard
│               └── AuditLogViewer.tsx   # Searchable audit log & JSON diff inspector
└── server/                              # Backend API, Bot & WebSockets (R4, R5, R6, R7)
    ├── src/
    │   ├── utils/
    │   │   ├── logger.ts                # Centralized structured NDJSON logger
    │   │   └── sanitize.ts              # escapeHtml() and URL sanitizers
    │   ├── middleware/
    │   │   ├── requestId.ts             # AsyncLocalStorage request correlation
    │   │   ├── scannerShield.ts         # Trusted IP extraction
    │   │   └── rateLimit.ts             # Trusted IP extraction
    │   ├── services/
    │   │   ├── matchmaking.ts           # Strict whole-band scoring (5-9)
    │   │   └── plan.ts                  # Type-safe plan lifecycle
    │   ├── routes/
    │   │   ├── admin.ts                 # Admin mutations with audit logging
    │   │   └── adminTelemetry.ts        # Live telemetry health/queue probes
    │   ├── socket/
    │   │   └── signaling.ts             # Correlated logging & signaling
    │   ├── bot/                         # HTML-escaped bot message templates
    │   └── index.ts                     # API domain isolation (Disallow: /)
    └── prisma/
        └── schema.prisma                # Whole-band validation & audit models
```
