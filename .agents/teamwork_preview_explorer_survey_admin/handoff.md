# Admin Panel Survey & Architecture Handoff Report

## 1. Observation

Direct examination of `D:\telegram-p2p-voice-call\admin` reveals the following state:

- **Directory Structure & Files**:
  - `package.json` (`D:\telegram-p2p-voice-call\admin\package.json`):
    - `name`: `"admin"`
    - Current dependencies: `react` (^19.2.8), `react-dom` (^19.2.8).
    - Current devDependencies: `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `oxlint`, `typescript`, `vite`.
    - Build script: `"build": "tsc -b && vite build"`.
    - Missing packages: `lucide-react` (icon UI kit) and API layer utilities.
  - `src/App.tsx` (`D:\telegram-p2p-voice-call\admin\src\App.tsx`, lines 7–31):
    - Contains template demo code for Vite counter button: `<button onClick={() => setCount((count) => count + 1)}>Count is {count}</button>`.
    - No admin login, security 2FA token exchange, or dashboard UI implemented.
  - `src/main.tsx` (`D:\telegram-p2p-voice-call\admin\src\main.tsx`):
    - Standard React DOM root entry rendering `<App />`.
  - `vite.config.ts` (`D:\telegram-p2p-voice-call\admin\vite.config.ts`):
    - Default Vite React plugin setup.
  - `node_modules` directory:
    - Does **not exist**; packages need installation via `npm install`.

---

## 2. Logic Chain

From requirements R3 in `D:\telegram-p2p-voice-call\.agents\ORIGINAL_REQUEST.md` and backend contracts in `D:\telegram-p2p-voice-call\.agents\teamwork_preview_explorer_survey_backend\handoff.md`:

1. **Current Codebase Gap**:
   - The `admin` project is a bare Vite starter template. Every feature required by R3 (stealth 2FA login, WebApp Lockdown browser access handling, Analytics overview, Stars revenue metrics, dynamic plan limits/price editor, and Unblock Appeals queue) must be designed and implemented from scratch.

2. **Stealth `/admin` 2FA Access & Token Exchange Security**:
   - Telegram Bot `/admin` command issues a secret 1-time link containing a token parameter (`https://<admin-host>/?token=<one_time_token>`).
   - The Admin Web App reads `?token=...` from `window.location.search`.
   - If a token is present, the app presents the **2FA Master Password** entry screen.
   - On submission, the client calls `POST /api/admin/login` with `{ token, masterPassword }`.
   - The server validates the token & master password, returns a JWT session token.
   - The client stores the JWT in `localStorage` / `sessionStorage` and injects `Authorization: Bearer <jwt>` into subsequent HTTP requests.
   - If access is attempted without a valid session or 2FA token, the client renders a secure Lockdown / Access Denied screen.

3. **Mini App WebApp Lockdown vs. Admin Panel Security**:
   - The Mini App (`client`) blocks direct web browser access with `403 Forbidden` by validating Telegram `initData`.
   - The Admin Panel (`admin`) runs as a web dashboard requiring stealth token + 2FA authentication, isolating administrative features from unauthorized public access.

4. **Required Admin Dashboard Modules**:
   - **Header & Navigation**: Status bar, admin avatar/badge, active tab selector, and session Logout button.
   - **Analytics Overview Tab**:
     - Metric cards for Total Users, Monthly Active Users (MAU), Daily Active Users (DAU), Total Active Calls.
     - Telegram Stars Revenue Analytics: Total Stars earned, estimated USD conversion, transaction count, monthly breakdown bar chart/table.
   - **Plan Limits & Pricing Editor Tab**:
     - Dynamic editor form for Free, Plus, and Pro tiers:
       - Max Call Duration (e.g. Free: 15m, Plus: 30m, Pro: 60m).
       - Daily Call Limits.
       - Audio Recording Retention Days (Free: 1 day, Plus: 7 days, Pro: 30 days).
       - Plan Prices in Telegram Stars (Plus: 250 Stars, Pro: 500 Stars).
     - Submit handler firing `PUT /api/admin/plans` with toast notification feedback.
   - **Unblock Appeals Review Queue Tab**:
     - Penalty Ladder Context: 1st report = Warning; 2nd report = 6-hour block; 3rd report = Permanent lock.
     - Table listing pending appeals: User Alias, Telegram ID, Sub-scores (FC, LR, GRA, P), Ban Reason, Report Offense Logs, Appeal Reason text, Submission Date.
     - Actions: `[ Approve Unblock ]` (`POST /api/admin/appeals/:id/approve` -> clears ban, notifies user via bot), `[ Reject Appeal ]` (`POST /api/admin/appeals/:id/reject`).
   - **User Management & Moderation Search Tab**:
     - User search filter by Alias or Telegram ID.
     - Profile details view, sub-score inspect/override, manual warning/ban/unblock triggers.

---

## 3. Caveats

1. **Backend Integration & Dev Fallbacks**:
   - When running the frontend admin panel in local development before the backend server (`server`) is fully active, the API client should include a mock dev fallback state or clear connection error state so developers can preview and test UI components without crashing.
2. **Token Invalidation**:
   - Single-use 2FA tokens must be cleared from the URL bar immediately after parsing (`window.history.replaceState`) to prevent token leaking in browser history.

---

## 4. Conclusion & Recommended Admin Architecture

### Target File Structure (`D:\telegram-p2p-voice-call\admin\src`)

```
admin/src/
├── api/
│   └── client.ts                 # Axios/fetch API client with JWT interceptor & base URL config
├── components/
│   ├── layout/
│   │   ├── Header.tsx            # Dark glassmorphism header with status & logout
│   │   └── Sidebar.tsx           # Dashboard tab navigation sidebar
│   ├── auth/
│   │   └── LoginModal.tsx        # 2FA Master Password prompt & stealth token exchange
│   ├── dashboard/
│   │   ├── AnalyticsOverview.tsx # Total Users, MAU & Telegram Stars Revenue charts
│   │   ├── PlanEditor.tsx        # Dynamic Plan Limits & Price Editor forms
│   │   ├── AppealsQueue.tsx      # Unblock Appeals review queue with approve/reject
│   │   └── UserManagement.tsx    # User search & manual moderation controls
│   └── ui/
│       ├── StatCard.tsx          # Key metric display cards
│       ├── Toast.tsx             # Notification toast overlay
│       └── Modal.tsx             # Action confirmation dialogs
├── context/
│   ├── AuthContext.tsx           # Admin JWT auth state & token management
│   └── ToastContext.tsx          # Feedback toast context
├── types/
│   └── admin.ts                  # Shared TS interfaces (Stats, Plans, Appeals, Users, Auth)
├── App.css                       # Enterprise dark-themed glassmorphism styling
├── App.tsx                       # Tab layout switcher & auth route guard
└── main.tsx                      # Entry point
```

### Recommended Packages to Add
- `lucide-react`: UI icon set (Shield, Users, Star, Settings, Clock, CheckCircle, XCircle, Search, LogOut, RefreshCw).

---

## 5. Verification Method

To independently verify the Admin Panel implementation:

1. **Dependencies Installation**:
   Run `npm install` inside `D:\telegram-p2p-voice-call\admin`.
2. **Build Verification**:
   Run `npm run build` (`tsc -b && vite build`) inside `D:\telegram-p2p-voice-call\admin` to verify zero TypeScript errors and clean asset bundle generation.
3. **Runtime & UI Flow Verification**:
   Run `npm run dev` in `D:\telegram-p2p-voice-call\admin`:
   - Navigate to `http://localhost:5173/` without token -> verify login / locked prompt is displayed.
   - Navigate to `http://localhost:5173/?token=test_token` -> verify 2FA Master Password input modal opens.
   - Test switching tabs: Analytics Overview, Plan Limits & Price Editor, Unblock Appeals Queue, User Management.
