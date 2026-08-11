# Plan — IELTS Speaking P2P Partner Match & Voice Call

## High-Level Plan

1. **Phase 0: Survey & Codebase Exploration**
   - Dispatch 3 parallel Explorers:
     - `explorer_survey_1`: Survey Backend (`server/`) skeleton, package.json, dependencies, environment, database models, Telegram bot configuration, Redis, LiveKit integration points.
     - `explorer_survey_2`: Survey Frontend Mini App (`client/`) skeleton, UI framework, Telegram WebApp SDK, audio visualizer, LiveKit client SDK setup, state management.
     - `explorer_survey_3`: Survey Admin Panel (`admin/`) skeleton, authentication setup, stealth `/admin` handling, state management, dashboard components, API contracts.
   - Aggregate findings into `PROJECT.md` at project root.

2. **Phase 1: Architecture Specification & Feature Inventory (`PROJECT.md`)**
   - Define exact Feature Inventory mapped to requirements (R1: Bot Core, R2: Mini App, R3: Admin Panel, R4: Core Engine).
   - Establish Interface Contracts between Server, Mini App, and Admin Panel.
   - Define Code Layout and environment configuration.

3. **Phase 2: Execution via Sub-orchestrators**
   - Dispatch **Backend Sub-orchestrator**: Bot Slash Commands (`/start`, `/admin`), Menu buttons, Profile/Recordings/Plans/Direct Call/Support handlers, Redis complementary matchmaking ($O(1)$ bucket queue), LiveKit SFU WebRTC room management + Server-side egress audio recording, Automated scaled moderation penalty ladder, Daily storage cleanup background task.
   - Dispatch **Frontend Sub-orchestrator**: Ultra-Minimal Telegram Mini App, WebApp SDK initialization, Matchmaking Radar Screen with animated loader, Active Voice Call Screen with partner alias, live timer, dynamic audio visualizer waveform, Record ON/OFF toggle, Finish Call button.
   - Dispatch **Admin Panel Sub-orchestrator**: Stealth `/admin` Telegram 2FA secret link generation, WebApp Lockdown (403 for non-Telegram browser access), Master Password 2FA, Admin Dashboard (Total Users, MAU, Telegram Stars Revenue Analytics, dynamic plan limits/price editor, Unblock Appeals review queue).
   - Dispatch **E2E Testing Track Orchestrator**: Build E2E test harness, create Tier 1-4 test suite covering all features, generate `TEST_READY.md`.

4. **Phase 3: Integration, Verification & Tier 5 Hardening**
   - Execute Final Milestone: 100% E2E test pass across all tiers.
   - Run Tier 5 Adversarial Coverage Hardening with Challengers & Reviewers.
   - Run Forensic Auditor (`teamwork_preview_auditor`) for integrity verification.

5. **Phase 4: Victory Report**
   - Submit comprehensive completion report to Sentinel.
