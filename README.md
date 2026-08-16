# PairTalk — IELTS Speaking Peer-to-Peer Voice Platform

**PairTalk** is a real-time, peer-to-peer voice calling platform and Telegram Mini App engineered for IELTS candidates worldwide to practice spoken English in a distraction-free, privacy-preserving environment.

---

## Key Features

- **Skill-Calibrated Matchmaking**: High-speed radar matchmaking pairing learners by IELTS band and complementary sub-skills (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation).
- **100% Anonymity**: Permanent randomized aliases (e.g. `P2P-0284DB68`) ensure zero personal Telegram usernames or phone numbers are shared.
- **Encrypted WebRTC Audio**: Low-latency, phone-optimized two-way audio powered by LiveKit Selective Forwarding Units (SFUs).
- **Cloud Session Recordings**: Opt-in audio recording stored securely in AWS S3 with tier-based retention windows for post-call self-evaluation.
- **Direct Calling & Favorites**: Save practice partners to your Favorites list and initiate private 1-on-1 calls on demand.
- **Mutual Post-Call Peer Evaluation**: Structured feedback across IELTS criteria after each session to track fluency progress.
- **Dual-Currency Subscriptions**: Seamless plan upgrades using Telegram Stars (XTR) or Uzbek Soum (UZS) Card transfers.

---

## Authoritative Subscription Tiers

| Plan Tier | UZS Price | Stars Price | Monthly Calls | Max Call Duration | Monthly Recordings | Recording Retention |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FREE** | `0 UZS` | `0 XTR` | `3 calls` | `15 minutes` | `1 recording` | `1 day` |
| **PLUS** | `15,000 UZS` | `99 XTR` | `10 calls` | `30 minutes` | `3 recordings` | `7 days` |
| **PRO** | `55,000 UZS` | `349 XTR` | `25 calls` | `60 minutes` | `7 recordings` | `30 days` (1 month) |
| **BOSS** | `149,000 UZS` | `899 XTR` | `50 calls` | `90 minutes` | `15 recordings` | `90 days` (3 months) |

---

## Architecture Overview

The repository is organized as a monorepo:

- **`server/`**: Express API, Grammy Telegram Bot, Redis matchmaking & sliding rate limiting, LiveKit audio egress management, Prisma PostgreSQL ORM, and payment validation engines.
- **`client/`**: Telegram Mini App frontend (React, TypeScript, Vite, Tailwind CSS, LiveKit Web SDK, Socket.IO client).
- **`admin/`**: Operational admin console (React, Vite, Tailwind CSS) featuring live telemetry, manual payment receipt approvals, appeals queue, and user management.
- **`docs/`**: Canonical legal policies ([Privacy Policy](docs/PRIVACY_POLICY.md) and [Community Guidelines](docs/COMMUNITY_GUIDELINES.md)).

---

## Production Deployment

### Prerequisites
- Node.js >= 20.x
- PostgreSQL Database
- Redis Cache & Queue
- LiveKit Cloud or Self-Hosted SFU
- AWS S3 Bucket (for audio recording storage)
- Telegram Bot Token (via [@BotFather](https://t.me/BotFather))

### Configuration
1. Clone the repository and copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Populate `.env` with your production secrets (Database URL, Redis URL, Bot Token, LiveKit credentials, S3 credentials, Master Password).

### Build & Run
```bash
# Server
cd server
npm install
npx prisma generate
npx prisma db push
npm run build
npm start

# Client Mini App
cd ../client
npm install
npm run build

# Admin Panel
cd ../admin
npm install
npm run build
```

---

## Legal & Support

- **Privacy Policy**: [Read Policy](docs/PRIVACY_POLICY.md) (Public URL: `/privacy`)
- **Community Guidelines**: [Read Guidelines](docs/COMMUNITY_GUIDELINES.md) (Public URL: `/guidelines`)
- **Support & Inquiries**: Reach out to `@PairTalkSupport` on Telegram.
