# Scope: Milestone M3 — Web Admin Panel & Stealth Security

## Objectives
Implement, build, lint, and verify the Web Admin Panel in `D:\telegram-p2p-voice-call\admin`.

## Specific Requirements to Fulfill
1. **Dependencies & UI Kit**:
   - Install `lucide-react` and API client tools in `admin/package.json`.
2. **Stealth `/admin` 2FA Access & Auth Flow (`LoginModal.tsx` & `AuthContext.tsx`)**:
   - Parse 1-time token parameter `?token=...` from `window.location.search`.
   - Present 2FA Master Password prompt.
   - Post credentials to `POST /api/admin/login` to obtain JWT session token.
   - Guard administrative features behind JWT authorization header (`Authorization: Bearer <token>`).
3. **Analytics Dashboard (`AnalyticsOverview.tsx`)**:
   - Total Users, Monthly Active Users (MAU), Daily Active Users (DAU), Total Active Calls.
   - Monthly and Total Telegram Stars Revenue Analytics metrics and charts.
4. **Dynamic Plan Limits & Pricing Editor (`PlanEditor.tsx`)**:
   - View & update call duration limits, daily call limits, audio recording retention days (1d/7d/30d), and plan pricing in Telegram Stars.
5. **Unblock Appeals Review Queue (`AppealsQueue.tsx`)**:
   - Review banned user appeals with sub-scores, ban reason, offense logs, and appeal text.
   - `[ Approve Unblock ]` and `[ Reject Appeal ]` actions calling backend API.
6. **User Management & Moderation Search (`UserManagement.tsx`)**:
   - Search users by plain text alias or Telegram ID with manual moderation controls.

## Target File Structure
- `admin/package.json`
- `admin/src/App.tsx`
- `admin/src/api/client.ts`
- `admin/src/context/AuthContext.tsx`
- `admin/src/components/auth/LoginModal.tsx`
- `admin/src/components/dashboard/AnalyticsOverview.tsx`
- `admin/src/components/dashboard/PlanEditor.tsx`
- `admin/src/components/dashboard/AppealsQueue.tsx`
- `admin/src/components/dashboard/UserManagement.tsx`

## Verification Criteria
- `npm run build` (`tsc -b && vite build`) succeeds with zero errors in `admin/`.
- `npm run lint` runs clean with 0 errors.

## Milestone Status
Status: **DONE**
All implementation and verification criteria passed in Iteration 1.
