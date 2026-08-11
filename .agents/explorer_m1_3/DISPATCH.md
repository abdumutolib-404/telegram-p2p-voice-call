# Explorer 3 Dispatch — Matchmaking, SFU Egress, Moderation & REST APIs

**Working Directory**: D:\telegram-p2p-voice-call\.agents\explorer_m1_3
**Project Root**: D:\telegram-p2p-voice-call
**Server Directory**: D:\telegram-p2p-voice-call\server
**Original Request**: D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md
**Project Index**: D:\telegram-p2p-voice-call\PROJECT.md
**Scope Document**: D:\telegram-p2p-voice-call\.agents\sub_orch_backend\SCOPE.md

## Objectives
1. Read ORIGINAL_REQUEST.md, PROJECT.md, and SCOPE.md.
2. Investigate backend service requirements in `server/src/services/`, `server/src/routes/`, `server/src/socket/`, and `server/src/middleware/`:
   - $O(1)$ Redis bucketized queue matchmaking engine (`match_queue:<band>:<weak>:<strong_skill>`) and instant cancellation.
   - LiveKit SFU room token generation API and dual-voice Egress recording service with headphone support.
   - Daily storage cleanup cron task enforcing retention policies (Free: 1 day, Plus: 7 days, Pro: 30 days).
   - Automated moderation penalty ladder (Warning -> 6h ban -> Permanent lock).
   - Mixed-plan call max duration calculation rule ($\max(limit_A, limit_B)$).
   - Telegram WebApp `initData` HMAC validation middleware (403 Lockdown).
   - Stealth `/admin` token exchange & Admin management REST API endpoints (`GET /api/admin/stats`, `GET/PUT /api/admin/plans`, `GET/POST /api/admin/appeals`).
3. Examine existing files in `server/` and identify missing implementations or refactoring needed.
4. Recommend exact implementation architecture and file layout for Worker.
5. Write your comprehensive handoff analysis report to `D:\telegram-p2p-voice-call\.agents\explorer_m1_3\analysis.md` and send completion message back to parent.
