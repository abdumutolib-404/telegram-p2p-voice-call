# PairTalk Developer Documentation Suite

> **Standard**: Cloudflare / Stripe / AWS Grade Production Engineering Documentation  
> **Target Audience**: Core Engineers, Systems Architects, and Technical Operators  
> **Platform Version**: 2.4.0-production (Go 1.26.5 / Node 20+ / React 19.2.8 / PostgreSQL 16 / Redis 7)

---

## 1. Platform Mission & Architecture Overview

**PairTalk** is a real-time peer-to-peer IELTS Speaking preparation ecosystem engineered for sub-second criteria matchmaking, studio-grade WebRTC voice communication, automated audio recording egress, and autonomous practice assistance. The platform operates natively within Telegram Mini Apps and standard modern desktop/mobile web browsers.

### Core Capabilities

- **Sub-Second Criteria Matchmaking**: Evaluates candidates based on official British Council / IDP IELTS band descriptors across four sub-criteria: Fluency & Coherence (**FC**), Lexical Resource (**LR**), Grammatical Range & Accuracy (**GRA**), and Pronunciation (**P**). Matches learners in complementary skill buckets (e.g. strong vocabulary paired with strong fluency) using non-blocking atomic Redis Lua scripts.
- **High-Concurrency Voice Core**: Built on Go 1.26.5 and LiveKit SFU (Selective Forwarding Unit), establishing encrypted, low-latency audio calls with jitter buffers and noise cancellation.
- **Automated Cloud Egress & Recording Pipeline**: LiveKit composite audio egress automatically captures sessions in MP3 format, uploading to AWS S3 or Cloudflare R2 with tiered retention policies (1 to 90 days) and signed download delivery.
- **Dual-Tier Monetization Desk**: Supports frictionless in-app microtransactions via **Telegram Stars** (`XTR`) alongside a manual bank card payment desk for **Uzbekistan Som** (`UZS`), complete with OCR receipt verification and dispute resolution workflows.
- **Autonomous Question Ingestion & AI Curation**: Continuous web crawler scraping official IELTS recall materials, sanitized through **Google Gemini 2.0 Flash** for exam authenticity, CEFR calibration, and structural deduplication.
- **Stealth 2FA Operations Control Plane**: React-powered administrative panel protected by two-factor authentication (master password + cryptographic Telegram OTP challenge via private bot dispatch).

---

## 2. Platform Tech Stack Matrix

| Layer / Subsystem | Technology | Version | Package / Engine | Architectural Role & Runtime Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Edge & Voice Gateway** | Go | `1.26.5` | Gin (`v1.9.1`), Gorilla WebSocket (`v1.5.1`), `go-redis/v9`, `jackc/pgx/v5`, LiveKit Go SDK (`v2.1.2`) | Binds public `PORT=3001`. Handles WebSocket connections (`/socket.io/*`), executes atomic matchmaking Lua scripts, dispenses LiveKit tokens, manages MP3 recording egress, and reverse-proxies REST traffic to Node.js backend. |
| **Application Server** | Node.js / TypeScript | Node `20+`, TS `5.4.5` | Express (`4.19.2`), grammY (`1.26.0`), `@grammyjs/runner` (`2.0.3`), Prisma ORM (`5.12.0`), `ioredis` (`5.4.1`) | Binds internal `PORT=3000`. Executes business logic, Telegram Bot interactions, payment reconciliation, cron schedulers, and REST API endpoints. Operates behind a distributed Redis leader lock (`pairtalk:bot:leader:lock`). |
| **Mini App Client** | React / TypeScript | React `19.2.8`, Vite `8.2.0` | Tailwind CSS (`v4.0.9`), `@tailwindcss/vite`, `livekit-client` (`2.9.2`), `socket.io-client` (`4.8.1`), Lucide React | Embedded Telegram WebApp client. Handles real-time audio visualization, in-call IELTS question cards, WebRTC media streams, and queue telemetry. |
| **Admin Operations Panel** | React / TypeScript | React `19.2.8`, Vite `8.2.0` | Tailwind CSS (`v4.0.9`), Lucide React (`1.31.0`) | Internal operations portal. Manages user bans, plan adjustments, dispute appeals, manual receipt verification, and live cluster health telemetry. |
| **Primary Relational Store** | PostgreSQL | `16` | Prisma ORM, `jackc/pgx/v5` connection pool | Persistent relational storage for users, call sessions, payment ledgers, audit logs, and curated IELTS question banks. Enforces strict foreign keys and composite indexes. |
| **Distributed Cache & State** | Redis | `7.0+` | Alpine Redis, Redis Cluster / Sentinel compatible | In-memory atomic state store. Manages matchmaking queues, sliding window rate limits, 15-second disconnect grace timers, and inter-process Pub/Sub signaling (`pairtalk:events`, `pairtalk:commands`). |
| **Media SFU & Transcoding** | LiveKit SFU | `v1.7+` / Cloud | LiveKit Server & Cloud Composite Egress | WebRTC media bridge. Encrypts and forwards Opus audio tracks between peers without transcoding overhead, delivering composite single-track MP3 audio upon call completion. |
| **Object Cloud Storage** | AWS S3 / Cloudflare R2 | S3 API v4 | `@aws-sdk/client-s3` (`3.1111.0`), AWS Go SDK v2 | Secure storage for audio call recordings with deterministic presigned download URLs and automated lifecycle retention policies. |

---

## 3. High-Level Traffic & Subsystem Topology

```mermaid
flowchart TD
    subgraph Clients["Clients & Edge Entry"]
        TMA["Telegram WebApp (Client)"]
        Browser["Desktop / Mobile Browser"]
        AdminUI["React Admin Operations Panel"]
        TGC["Telegram Cloud API"]
    end

    subgraph IngressGateway["Go Voice & Edge Gateway (:3001)"]
        Gin["Gin Edge Engine"]
        Proxy["Reverse Proxy (httputil)"]
        SIO["Socket.IO v4 Engine (Gorilla WS)"]
        Match["Matchmaking Engine (Lua)"]
        LKGen["LiveKit Token Dispenser"]
    end

    subgraph AppServer["Node.js Application Server (:3000)"]
        Express["Express REST Engine"]
        Bot["grammY Bot Runner (Leader Lock)"]
        IELTS["Crawler & Gemini 2.0 Flash"]
        Sub["Redis Event Subscriber"]
    end

    subgraph Infrastructure["Storage & Media Fabric"]
        PG[(PostgreSQL 16)]
        RDB[(Redis 7 Cluster)]
        SFU["LiveKit Cloud SFU (WebRTC Audio)"]
        S3["AWS S3 / Cloudflare R2 (MP3 Egress)"]
    end

    TMA -->|WSS /socket.io| SIO
    Browser -->|WSS /socket.io| SIO
    TMA -->|HTTPS REST| Gin
    Browser -->|HTTPS REST| Gin
    AdminUI -->|HTTPS REST /api/admin| Gin
    TGC -->|Webhook Updates| Gin

    Gin -->|"/socket.io/*" & "/healthz"| SIO
    Gin -->|"/*" Reverse Proxy| Proxy
    Proxy --> Express

    SIO <--> Match
    SIO --> LKGen
    LKGen --> SFU
    Match <-->|Atomic Lua Scripts| RDB

    Express <--> PG
    Express <--> RDB
    Bot <--> PG
    Bot <--> RDB
    IELTS --> PG

    SIO -->|Publishes "pairtalk:events"| RDB
    RDB -->|Subscribes "pairtalk:commands"| SIO
    Sub -->|Listens "pairtalk:events"| RDB
    Express -->|Emits "pairtalk:commands"| RDB

    SFU -->|WebRTC Opus Audio| TMA
    SFU -->|WebRTC Opus Audio| Browser
    SFU -->|Composite Audio Egress| S3
```

---

## 4. 5-Minute Quickstart Guide

This guide prepares a fully functional local development environment with Go Gateway, Node Server, PostgreSQL, Redis, and React frontends.

### 4.1 Prerequisites

Ensure the following tools are installed on your host system:
- **Go**: `1.26+` (`go version`)
- **Node.js**: `20.12+` and `npm 10+` (`node -v`, `npm -v`)
- **Docker & Docker Compose**: For running containerized PostgreSQL 16 and Redis 7.

### 4.2 Clone & Configure Environment

```bash
# Clone the repository
git clone https://github.com/abdumutolib-404/telegram-p2p-voice-call.git
cd telegram-p2p-voice-call

# Create local environment configuration from template
cp .env.example .env
```

Review your `.env` file and set the required variables:
```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pairtalk?sslmode=disable"
REDIS_URL="redis://localhost:6379"
BOT_TOKEN="123456789:AAFakeTokenForLocalTestingPairTalkDev"
MASTER_PASSWORD="LocalDevAdminPassword123!"
JWT_SECRET="local_development_cryptographically_secure_jwt_secret_32b"
LIVEKIT_HOST="https://dev-livekit.example.com"
LIVEKIT_API_KEY="devkey"
LIVEKIT_API_SECRET="secret"
ADMIN_TELEGRAM_IDS="123456789"
```

### 4.3 Spin Up Infrastructure (PostgreSQL & Redis)

Run the included Docker Compose configuration:
```bash
docker-compose up -d postgres redis
```

Verify services are running:
```bash
docker-compose ps
```

### 4.4 Initialize Database & Seed Content

```bash
cd server
npm install
npx prisma db push
npx prisma generate
```

### 4.5 Launch Services

Open four terminal tabs:

**Tab 1: Node Application Server (:3000)**
```bash
cd server
npm run dev
# Server listens on internal port 3000
```

**Tab 2: Go Edge & Voice Gateway (:3001)**
```bash
cd gateway
go run ./cmd/gateway
# Gateway listens on public port 3001, proxying to 3000
```

**Tab 3: React Mini App Client (:5173)**
```bash
cd client
npm install
npm run dev
```

**Tab 4: React Admin Operations Console (:5174)**
```bash
cd admin
npm install
npm run dev
```

### 4.6 Verification Probes

Verify the entire subsystem pipeline with curl:

```bash
# 1. Gateway Health Probe (Direct Go Gin Engine)
curl -i http://localhost:3001/healthz
# Expected: HTTP/1.1 200 OK -> {"status":"ok","service":"gateway",...}

# 2. Server Health Probe (Proxied through Go to Node.js)
curl -i http://localhost:3001/health
# Expected: HTTP/1.1 200 OK -> {"status":"ok","db":"connected",...}

# 3. IELTS Topic Catalog (Proxied REST API)
curl -i http://localhost:3001/api/ielts/topics
# Expected: HTTP/1.1 200 OK -> {"success":true,"topics":[...]}
```

---

## 5. Documentation Suite Blueprint

Navigate the complete architectural specifications using the following documentation manuals:

| Document | Link | Core Contents |
| :--- | :--- | :--- |
| **Architecture & Ingress** | [`docs/ARCHITECTURE.md`](file:///D:/telegram-p2p-voice-call/docs/ARCHITECTURE.md) | 4-tier hybrid architecture topology, Go reverse proxy internals, Redis Pub/Sub event bridge, distributed leader lock, LiveKit SFU signaling. |
| **REST API Reference** | [`docs/API_REFERENCE.md`](file:///D:/telegram-p2p-voice-call/docs/API_REFERENCE.md) | Exhaustive specification of every REST route: Server Roots, Auth, Calls, IELTS, Webhooks, Admin Auth (Stealth 2FA), Telemetry, Candidates, Payments, Appeals, Plans, Contests, and Crawler controls. |
| **WebSocket Events** | [`docs/WEBSOCKET_EVENTS.md`](file:///D:/telegram-p2p-voice-call/docs/WEBSOCKET_EVENTS.md) | Socket.IO v4 Engine.IO protocol, Telegram initData token authentication, client/server event catalog, 15s disconnect grace timer, authoritative teardown clock. |
| **Circulation Workflows** | [`docs/CIRCULATION_WORKFLOWS.md`](file:///D:/telegram-p2p-voice-call/docs/CIRCULATION_WORKFLOWS.md) | 5 end-to-end Mermaid sequence diagrams: Matchmaking Queue Circulation, Voice Call & Cloud Egress, Direct Call, Payment Upgrade (Stars & UZS Card), and Ban Appeals. |
| **State, Storage & Rate Limits** | [`docs/STATE_AND_STORAGE.md`](file:///D:/telegram-p2p-voice-call/docs/STATE_AND_STORAGE.md) | 13 PostgreSQL Prisma models with constraints and indexes, 28 Redis key namespace patterns with TTLs, and 22 distributed rate limiting actions. |
| **Environment & Deployment** | [`docs/ENVIRONMENT_AND_DEPLOYMENT.md`](file:///D:/telegram-p2p-voice-call/docs/ENVIRONMENT_AND_DEPLOYMENT.md) | Complete environment variable dictionaries for Gateway, Server, Client, and Admin, multi-container Docker, and zero-downtime Railway deployment guide. |
