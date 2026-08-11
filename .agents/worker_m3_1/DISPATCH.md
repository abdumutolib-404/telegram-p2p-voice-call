# Worker 1 Dispatch — Milestone M3 (Web Admin Panel)

**Working Directory**: `D:\telegram-p2p-voice-call\.agents\worker_m3_1`
**Target Codebase**: `D:\telegram-p2p-voice-call\admin`

## Mandatory Documents to Read
- `D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md`
- `D:\telegram-p2p-voice-call\PROJECT.md`
- `D:\telegram-p2p-voice-call\.agents\sub_orch_admin\SCOPE.md`
- `D:\telegram-p2p-voice-call\.agents\explorer_m3_1\handoff.md`
- `D:\telegram-p2p-voice-call\.agents\explorer_m3_2\handoff.md`
- `D:\telegram-p2p-voice-call\.agents\explorer_m3_3\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objectives
1. Install dependencies in `admin/package.json`:
   - Run `cmd.exe /c npm install` and `cmd.exe /c npm install lucide-react` in `D:\telegram-p2p-voice-call\admin`.
2. Implement all required components in `D:\telegram-p2p-voice-call\admin`:
   - `admin/src/types/index.ts`: Full TypeScript interfaces (`AdminStats`, `PlansResponse`, `PlanTierConfig`, `AppealItem`, `UserItem`, `AuthResponse`). Note: Use `import type` everywhere due to `verbatimModuleSyntax: true`.
   - `admin/src/api/client.ts`: Centralized fetch client with `Authorization: Bearer <jwtToken>` header injection, token storage, and 401 unauthorized handling.
   - `admin/src/context/AuthContext.tsx`: Stealth 2FA auth context parsing `?token=...` from `window.location.search`, URL scrubbing with `window.history.replaceState`, token state, and login/logout handlers.
   - `admin/src/components/auth/LoginModal.tsx`: 2FA Master Password prompt modal pre-filling URL token, sending `POST /api/admin/login`.
   - `admin/src/components/dashboard/AnalyticsOverview.tsx`: Analytics overview cards (Total Users, MAU, DAU, Total Active Calls, Stars revenue) & monthly Telegram Stars revenue breakdown.
   - `admin/src/components/dashboard/PlanEditor.tsx`: Dynamic tier call duration limits, daily call limits, retention days (1d/7d/30d), and Stars pricing editor connected to `GET /api/admin/plans` & `PUT /api/admin/plans`.
   - `admin/src/components/dashboard/AppealsQueue.tsx`: Moderation appeals review queue displaying sub-scores (FC, LR, GRA, P), ban reason, offense logs, appeal text, and `[ Approve Unblock ]` / `[ Reject Appeal ]` actions.
   - `admin/src/components/dashboard/UserManagement.tsx`: User search by alias or Telegram ID with status filter tabs, user table, and manual moderation controls (`warn`, `block`, `ban`, `unblock`).
   - `admin/src/App.tsx`: Main layout, tab navigation, auth guard rendering `LoginModal` when unauthenticated, header with logout button.
3. Build and Lint Verification:
   - Run `cmd.exe /c npm run build` (`tsc -b && vite build`) in `admin/` to ensure zero compilation or type errors.
   - Run `cmd.exe /c npm run lint` in `admin/` to ensure zero lint errors.
4. Document all changes and verification command outputs in `D:\telegram-p2p-voice-call\.agents\worker_m3_1\changes.md` and handoff report in `D:\telegram-p2p-voice-call\.agents\worker_m3_1\handoff.md`.
