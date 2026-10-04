# PairTalk — Project Directory Tree

> **268 tracked source files** across 5 packages.
> Generated on 2026-09-09. Excludes `node_modules/`, `dist/`, and build artifacts.

```
D:\telegram-p2p-voice-call\
│
├── .env.example                          # Root environment template
├── .gitignore
├── Dockerfile                            # Production container (Node.js)
├── docker-compose.yml                    # Local dev stack (app + PostgreSQL + Redis)
├── DEPLOYMENT_GUIDE.md                   # Step-by-step Railway deployment
├── PROJECT.md                            # Architecture & feature inventory
├── DIRECTORY_TREE.md                     # ← This file
│
│
├── docs/                                 # 📚 Public documentation & policies
│   ├── API_REFERENCE.md
│   ├── ARCHITECTURE.md
│   ├── CIRCULATION_WORKFLOWS.md
│   ├── COMMUNITY_GUIDELINES.md
│   ├── ENVIRONMENT_AND_DEPLOYMENT.md
│   ├── FAQ.md
│   ├── HOW_IT_WORKS.md
│   ├── IELTS_SPEAKING_GUIDE.md
│   ├── IMPROVEMENT_ENGINEERING_PLAN.md
│   ├── PRIVACY_POLICY.md
│   ├── README.md
│   ├── SAFETY_GUIDE.md
│   ├── STATE_AND_STORAGE.md
│   ├── TERMS_OF_SERVICE.md
│   ├── WEBRTC_CROSS_DEVICE_AUDIO_GUIDE.md
│   └── WEBSOCKET_EVENTS.md
│
│
├── server/                               # 🖥️ Backend API (Node.js + Express + Prisma)
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── docker-entrypoint.sh
│   │
│   ├── assets/
│   │   └── plans_pricing.jpg
│   │
│   ├── prisma/
│   │   └── schema.prisma                 # 12 models: User, CallSession, CallRating, etc.
│   │
│   ├── scripts/
│   │   ├── exportQuestions.ts
│   │   ├── purgeGarbageQuestions.ts
│   │   └── testGeminiApi.ts
│   │
│   └── src/
│       ├── index.ts                      # App entry — Express, Socket.IO, Bot, crons
│       │
│       ├── config/
│       │   ├── database.ts               # Prisma client init
│       │   ├── env.ts                    # Environment variable validation
│       │   ├── inMemoryPrismaMock.ts     # Test mock
│       │   ├── livekit.ts               # LiveKit client config
│       │   └── redis.ts                 # ioredis pub/sub clients
│       │
│       ├── middleware/
│       │   ├── adminAuth.ts             # HMAC + 2FA + Trusted IP
│       │   ├── initDataLockdown.ts      # Telegram initData validation
│       │   ├── rateLimit.ts             # Redis-based rate limiting
│       │   ├── requestId.ts             # AsyncLocalStorage correlation
│       │   └── scannerShield.ts         # Trusted IP extraction & scanner blocking
│       │
│       ├── routes/
│       │   ├── admin.ts                 # Admin CRUD (users, payments, moderation)
│       │   ├── adminIelts.ts            # Admin IELTS topic/question management
│       │   ├── adminTelemetry.ts        # Health, queue, active-calls, errors probes
│       │   ├── auth.ts                  # initData auth & JWT issuance
│       │   ├── calls.ts                 # Call history & recordings
│       │   ├── ielts.ts                 # Public IELTS questions API
│       │   └── livekitWebhook.ts        # Egress completion webhook
│       │
│       ├── services/
│       │   ├── analytics.ts             # Usage analytics
│       │   ├── announcement.ts          # Broadcast announcements
│       │   ├── directCallMessages.ts    # Direct call invitation messages
│       │   ├── eventSubscriber.ts       # Redis pub/sub event listener
│       │   ├── leaderLock.ts            # Redis leader election for crons
│       │   ├── matchmaking.ts           # Band-based queue matching (5-9)
│       │   ├── moderation.ts            # Warning escalation & ban logic
│       │   ├── plan.ts                  # Plan lifecycle (FREE/PLUS/PRO/BOSS)
│       │   ├── rateLimitMatrix.ts       # Per-plan rate limit tiers
│       │   ├── referralService.ts       # Referral rewards & tracking
│       │   ├── s3Storage.ts             # S3/R2 recording upload
│       │   ├── storage.ts              # Recording retention purge cron
│       │   ├── subscriptionExpiry.ts    # Subscription expiry reminders
│       │   ├── surgeAlertService.ts     # Queue surge notifications
│       │   ├── topicNotificationService.ts  # New topic alerts
│       │   │
│       │   └── crawler/                 # 🕷️ IELTS Question Crawler Pipeline
│       │       ├── aiCurationService.ts     # Gemini AI question curation
│       │       ├── crawlerScheduler.ts      # Cron scheduler
│       │       ├── fingerprint.ts           # SHA-256 dedup fingerprinting
│       │       ├── ingestionService.ts      # Question ingestion orchestrator
│       │       ├── questionFilterService.ts # Quality filtering
│       │       ├── semanticMatcher.ts       # Topic semantic matching
│       │       ├── sources.ts               # Crawl source definitions
│       │       ├── taxonomy.ts              # Topic taxonomy
│       │       ├── verifyCrawler.ts          # Cache priming & verification
│       │       └── webCrawlerService.ts     # HTML fetch & parse
│       │
│       ├── socket/
│       │   └── signaling.ts             # WebSocket signaling & matchmaking events
│       │
│       ├── bot/
│       │   ├── bot.ts                   # Grammy bot factory & setup
│       │   ├── types.ts                 # Bot context types
│       │   ├── notifications.ts         # Push notification helpers
│       │   ├── paymentsBot.ts           # Telegram Stars payment handler
│       │   ├── receiptValidator.ts      # Manual payment receipt validation
│       │   │
│       │   ├── commands/
│       │   │   ├── start.ts             # /start command & onboarding
│       │   │   └── admin.ts             # /admin, /broadcast commands
│       │   │
│       │   └── handlers/
│       │       ├── callbacks.ts         # Inline keyboard callbacks
│       │       ├── menu.ts              # Bot menu button handler
│       │       ├── payments.ts          # Stars pre-checkout & success
│       │       ├── postCall.ts          # Post-call rating prompts
│       │       └── refund.ts            # Refund request handler
│       │
│       ├── types/
│       │   └── canonical.ts             # Shared TypeScript types
│       │
│       ├── utils/
│       │   ├── logger.ts                # Structured NDJSON logger + PII redaction
│       │   ├── requestContext.ts        # AsyncLocalStorage helpers
│       │   └── sanitize.ts             # HTML escape & URL sanitization
│       │
│       └── __tests__/                   # 🧪 55 Vitest test suites
│           ├── adminApi.test.ts
│           ├── adminTelemetry.test.ts
│           ├── adminTelemetryStress.test.ts
│           ├── admin_crawler_gemini_routes.test.ts
│           ├── adversarial_edge_routing_challenge.test.ts
│           ├── adversarial_forensic.test.ts
│           ├── adversarial_m1_1.test.ts
│           ├── adversarial_m1_2.test.ts
│           ├── ai_curation.test.ts
│           ├── announcement.test.ts
│           ├── auditor_m4_forensic.test.ts
│           ├── auth_2fa_redis.test.ts
│           ├── auth_architecture.test.ts
│           ├── bot.test.ts
│           ├── call_duration_recovery.test.ts
│           ├── canonical_production_gate.test.ts
│           ├── challenger_m4_adversarial.test.ts
│           ├── championship_refund_access_moderation.test.ts
│           ├── circulation_and_upgrade_repair.test.ts
│           ├── client_schema_jsonld_and_seo.test.ts
│           ├── concurrency_correlation_challenge.test.ts
│           ├── deep_forensic_phase_audit.test.ts
│           ├── edge_routing_and_seo.test.ts
│           ├── egress_webhook_and_s3_pipeline.test.ts
│           ├── ephemeral_direct_calls_and_sync.test.ts
│           ├── eventSubscriber.test.ts
│           ├── final_pricing_and_admin_security.test.ts
│           ├── final_production_hardening.test.ts
│           ├── final_production_readiness_campaign.test.ts
│           ├── findings_f1_to_f7.test.ts
│           ├── ielts_export.test.ts
│           ├── ieltsCrawler.test.ts
│           ├── leaderLock.test.ts
│           ├── livekit_egress_recording.test.ts
│           ├── lockdown.test.ts
│           ├── logger.test.ts
│           ├── matchmaking.test.ts
│           ├── moderation.test.ts
│           ├── monotonic_order_id.test.ts
│           ├── optimization_latency_boost.test.ts
│           ├── pii_redaction.test.ts
│           ├── plan.test.ts
│           ├── plan_billing_migration.test.ts
│           ├── production_correction_campaign.test.ts
│           ├── rate_limit_matrix_resilience.test.ts
│           ├── receipt_validation_and_delivery.test.ts
│           ├── referral_contest_custom_plan.test.ts
│           ├── requestId.test.ts
│           ├── scanner_shield_and_ip_jail.test.ts
│           ├── security_audit_remediation.test.ts
│           ├── signaling_correlation.test.ts
│           ├── subscription_expiry_reminder.test.ts
│           ├── surge_alert_service.test.ts
│           ├── verifyCrawler.test.ts
│           └── zombie_session_cleaner.test.ts
│
│
├── client/                               # 📱 Telegram Mini App (React + Vite + TailwindCSS v4)
│   ├── .gitignore
│   ├── .oxlintrc.json
│   ├── index.html                        # <meta robots="noindex">
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── wrangler.jsonc                    # Cloudflare Pages config
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── favicon.png
│   │   ├── icons.svg
│   │   └── plans_pricing.jpg
│   │
│   └── src/
│       ├── App.css
│       ├── App.tsx                       # Main app — auth, matchmaking state machine
│       ├── index.css
│       ├── main.tsx
│       │
│       ├── assets/
│       │   └── hero.png
│       │
│       ├── components/
│       │   ├── ActiveCallScreen.tsx      # In-call UI, timer, controls
│       │   ├── AudioVisualizer.tsx       # Real-time audio waveform
│       │   ├── ErrorBoundary.tsx
│       │   ├── GuidelinesScreen.tsx
│       │   ├── LandingPage.tsx           # Home — band selection, queue entry
│       │   ├── LockdownScreen.tsx        # Banned user lockdown
│       │   ├── PlansModal.tsx            # Subscription plans purchase
│       │   ├── PrivacyScreen.tsx
│       │   ├── ProfileModal.tsx          # User stats & profile
│       │   ├── QuestionsDrawer.tsx       # IELTS question browser
│       │   └── RadarScreen.tsx           # Matchmaking radar animation
│       │
│       ├── constants/
│       │   └── plans.ts                  # Plan tier definitions
│       │
│       ├── hooks/
│       │   └── useLiveKit.ts             # LiveKit room hook
│       │
│       ├── services/
│       │   ├── logger.ts                 # Client-side logger
│       │   └── socket.ts                # Socket.IO client wrapper
│       │
│       └── types/
│           └── index.ts
│
│
├── admin/                                # ⚙️ Operations Control Plane (React + Vite)
│   ├── .gitignore
│   ├── .oxlintrc.json
│   ├── index.html                        # <meta robots="noindex">
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   │
│   ├── public/
│   │   ├── favicon.ico
│   │   ├── favicon.png
│   │   └── icons.svg
│   │
│   └── src/
│       ├── App.css
│       ├── App.tsx                       # Admin login, navigation, routing
│       ├── index.css
│       ├── main.tsx
│       │
│       ├── api/
│       │   └── client.ts                # HTTP client wrapper
│       │
│       ├── assets/
│       │   └── hero.png
│       │
│       ├── components/
│       │   ├── ErrorBoundary.tsx
│       │   │
│       │   ├── auth/
│       │   │   └── LoginModal.tsx        # Master password + 2FA OTP
│       │   │
│       │   ├── dashboard/
│       │   │   ├── AnalyticsOverview.tsx  # Usage analytics charts
│       │   │   ├── AppealsQueue.tsx       # Ban appeal review
│       │   │   ├── AuditLogViewer.tsx     # Searchable audit log + JSON diffs
│       │   │   ├── ContestManagement.tsx  # Referral championship wizard
│       │   │   ├── ManualPaymentsQueue.tsx # Payment approval queue
│       │   │   ├── OverviewDashboard.tsx  # Live telemetry health probes
│       │   │   ├── PlanEditor.tsx         # Plan configuration editor
│       │   │   ├── QuestionManagement.css
│       │   │   ├── QuestionManagement.tsx # IELTS question CRUD
│       │   │   └── UserManagement.tsx     # User search & moderation
│       │   │
│       │   └── ui/                       # Reusable UI components
│       │       ├── ConfirmDialog.tsx
│       │       ├── DataTable.tsx
│       │       ├── EmptyState.tsx
│       │       ├── LoadingSkeleton.tsx
│       │       ├── PageHeader.tsx
│       │       ├── StatCard.tsx
│       │       └── StatusBadge.tsx
│       │
│       ├── context/
│       │   └── AuthContext.tsx            # Auth state provider
│       │
│       ├── services/
│       │   └── api.ts                    # Admin API service layer
│       │
│       └── types/
│           └── index.ts
│
│
├── landing/                              # 🌐 Public SEO Surface (React + Vite, Cloudflare Pages)
│   ├── .gitignore
│   ├── index.html                        # Pre-rendered HTML + Schema.org JSON-LD
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   │
│   ├── public/
│   │   ├── .well-known/
│   │   │   └── agents.json               # AI agent discovery
│   │   ├── favicon.ico
│   │   ├── favicon.png
│   │   ├── icons.svg
│   │   ├── llms.txt                      # LLM context file
│   │   ├── llms-full.txt                 # Extended LLM context
│   │   ├── plans_pricing.jpg
│   │   ├── robots.txt                    # Crawler policy
│   │   └── sitemap.xml                   # 8 canonical URLs
│   │
│   └── src/
│       ├── App.tsx                       # 8-route history dispatcher
│       ├── index.css
│       ├── main.tsx
│       ├── telegram.d.ts
│       │
│       └── components/
│           ├── FaqScreen.tsx
│           ├── GuidelinesScreen.tsx
│           ├── HowItWorksScreen.tsx
│           ├── IeltsSpeakingGuideScreen.tsx
│           ├── LandingPage.tsx           # Hero, nav, 4-column footer
│           ├── PrivacyScreen.tsx
│           ├── SafetyGuideScreen.tsx
│           └── TermsScreen.tsx
│
│
├── gateway/                              # 🚀 Go Reverse Proxy (Gin + WebSocket)
│   ├── go.mod
│   ├── go.sum
│   │
│   ├── cmd/
│   │   └── gateway/
│   │       └── main.go                   # Entry point — Gin HTTP server
│   │
│   └── internal/
│       ├── auth/
│       │   ├── initdata.go               # Telegram HMAC verification
│       │   └── initdata_test.go
│       │
│       ├── config/
│       │   ├── env.go                    # Environment config
│       │   └── env_test.go
│       │
│       ├── database/
│       │   ├── pool.go                   # pgx connection pool
│       │   ├── queries.go                # SQL queries
│       │   └── queries_test.go
│       │
│       ├── livekit/
│       │   ├── client.go                 # LiveKit room management
│       │   ├── egress.go                 # Audio egress control
│       │   ├── token.go                  # Token generation
│       │   └── token_test.go
│       │
│       ├── matchmaking/
│       │   ├── engine.go                 # Redis queue matching
│       │   ├── engine_test.go
│       │   ├── lua.go                    # Lua scripts for atomic ops
│       │   └── service.go               # Matchmaking service
│       │
│       ├── proxy/
│       │   ├── reverse_proxy.go          # Reverse proxy to Node.js
│       │   └── reverse_proxy_test.go
│       │
│       └── signaling/
│           ├── handler.go                # WebSocket message handler
│           ├── hub.go                    # Connection hub
│           ├── pubsub.go                 # Redis pub/sub bridge
│           ├── reconciliation.go         # State reconciliation
│           ├── signaling_test.go
│           ├── socketio.go               # Socket.IO protocol compat
│           ├── timers.go                 # Call duration timers
│           ├── types.go                  # Shared types
│           └── zombie.go                 # Zombie session cleanup
│
│
└── test/                                 # 🧪 E2E & Integration Test Tiers
    ├── run_all.js                        # Test runner
    │
    ├── harness/
    │   ├── botMock.js                    # Bot mock helpers
    │   ├── dbHelper.js                   # Database test helpers
    │   ├── harnessValidation.test.js
    │   ├── socketClient.js               # Socket.IO test client
    │   └── webappAuth.js                 # Auth test helpers
    │
    ├── tier1_protocol/
    │   ├── adminManagement.test.js
    │   ├── botFeatures.test.js
    │   ├── matchmakingCalls.test.js
    │   └── securityModeration.test.js
    │
    ├── tier2_api_socket/
    │   ├── boundariesLiveKit.test.js
    │   ├── boundariesMatchmaking.test.js
    │   ├── boundariesModeration.test.js
    │   └── boundariesSecurity.test.js
    │
    ├── tier3_workflows/
    │   ├── crossMatchmakingCalls.test.js
    │   ├── crossModerationAppeals.test.js
    │   └── crossSecurityAdmin.test.js
    │
    └── tier4_opaque_e2e/
        ├── e2eAdminModerationJourney.test.js
        ├── e2eAdversarialSecurityJourney.test.js
        ├── e2eStudentJourney.test.js
        └── e2eSubscriptionJourney.test.js
```
