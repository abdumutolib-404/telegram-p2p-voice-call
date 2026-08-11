# Technical Analysis — Milestone M3 (Web Admin Panel)

**Explorer**: Explorer 1  
**Target Folder**: `D:\telegram-p2p-voice-call\admin`  
**Date**: 2026-08-11  

---

## 1. Executive Summary

`admin` is a React + Vite + TypeScript frontend application configured with oxlint for linting. However, it currently contains only default Vite starter boilerplate (`src/App.tsx`, `src/App.css`, default `src/index.css`) and lacks `node_modules` as well as mandatory dependencies (`lucide-react`).

To fulfill Milestone M3 requirements, the project requires:
1. Installing `lucide-react` and npm dependencies.
2. Developing type definitions for Admin API payloads (`src/types/index.ts`).
3. Implementing a central, type-safe API client with bearer token injection and standard error/401 handling (`src/api/client.ts`).
4. Implementing stealth 2FA authentication state management (`src/context/AuthContext.tsx`) and standard 2FA login modal (`src/components/auth/LoginModal.tsx`) parsing the one-time `?token=...` URL parameter.
5. Building the core administrative dashboard tabs:
   - **Analytics Overview** (`src/components/dashboard/AnalyticsOverview.tsx`): Total Users, MAU, DAU, Active Calls, and Telegram Stars Revenue Analytics.
   - **Dynamic Plan Editor** (`src/components/dashboard/PlanEditor.tsx`): Call duration limits, daily call limits, audio retention policies (1d/7d/30d), and Stars pricing editor.
   - **Unblock Appeals Queue** (`src/components/dashboard/AppealsQueue.tsx`): Review banned user appeals with IELTS sub-scores, ban reason, and approve/reject moderation triggers.
   - **User Management** (`src/components/dashboard/UserManagement.tsx`): Search users by alias or Telegram ID with manual moderation controls (`warn`, `block`, `unblock`).
6. Assembling the root dashboard layout with tab routing and auth guard (`src/App.tsx`) and polished CSS styling (`src/index.css`).

---

## 2. Directory & Dependency Analysis

### 2.1 File System Inspection

Current contents of `D:\telegram-p2p-voice-call\admin`:
```
admin/
├── .gitignore
├── .oxlintrc.json          # Oxlint configured (react/rules-of-hooks, react/only-export-components)
├── README.md
├── index.html
├── package.json            # React 19, Vite 8, Oxlint, TypeScript 6
├── public/
├── src/
│   ├── App.css             # Starter boilerplate styling
│   ├── App.tsx             # Starter Vite counter app (needs rewrite)
│   ├── index.css           # Base theme variables (light/dark mode)
│   └── main.tsx            # React DOM root mounting
├── tsconfig.app.json       # ES2023, verbatimModuleSyntax: true, noUnusedLocals: true
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

### 2.2 Dependency Requirements
- **Required Production Dependencies**:
  - `react`: `^19.2.8` (present)
  - `react-dom`: `^19.2.8` (present)
  - `lucide-react`: `^1.16.0` or latest (MISSING - must install)
- **Tooling / Environment Notes**:
  - Node modules are not currently installed.
  - On Windows, running `npm` commands directly in PowerShell encounters execution policy restrictions. All CLI execution must use `cmd.exe /c npm ...`.

---

## 3. Backend API Contract Specification

The Web Admin Panel interfaces with `POST /api/admin/login` and `/api/admin/*` endpoints on the backend server. All protected calls require `Authorization: Bearer <jwtToken>` HTTP header.

### 3.1 Stealth 2FA Auth Exchange
- **Endpoint**: `POST /api/admin/login`
- **Request Body**:
  ```json
  {
    "token": "one_time_token_from_url_param",
    "masterPassword": "admin_master_password"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "jwtToken": "eyJhbGciOi...",
    "expiresAt": "2026-08-12T20:24:42Z"
  }
  ```
- **Error Response (401 Unauthorized)**:
  ```json
  { "error": "Invalid master password or expired 2FA token" }
  ```

### 3.2 Analytics Dashboard
- **Endpoint**: `GET /api/admin/stats`
- **Response**:
  ```json
  {
    "totalUsers": 12450,
    "mau": 3820,
    "dau": 940,
    "activeCalls": 18,
    "starsRevenue": {
      "totalStars": 45200,
      "totalUsd": 565.00,
      "monthlyHistory": [
        { "month": "2026-05", "stars": 8500, "usd": 106.25 },
        { "month": "2026-06", "stars": 12400, "usd": 155.00 },
        { "month": "2026-07", "stars": 15100, "usd": 188.75 },
        { "month": "2026-08", "stars": 9200, "usd": 115.00 }
      ]
    }
  }
  ```

### 3.3 Dynamic Plan Limits & Pricing
- **Endpoint**: `GET /api/admin/plans`
- **Response**:
  ```json
  {
    "free": { "maxDuration": 15, "dailyLimit": 2, "retentionDays": 1 },
    "plus": { "maxDuration": 30, "dailyLimit": 10, "retentionDays": 7, "starsPrice": 250 },
    "pro": { "maxDuration": 60, "dailyLimit": 999, "retentionDays": 30, "starsPrice": 600 }
  }
  ```
- **Endpoint**: `PUT /api/admin/plans`
- **Request Body**: Same structure as GET response payload.

### 3.4 Unblock Appeals Queue
- **Endpoint**: `GET /api/admin/appeals`
- **Response**: Array of pending appeal objects:
  ```json
  [
    {
      "id": "appeal_101",
      "userId": "user_404",
      "alias": "BrightOwl42",
      "telegramId": "987654321",
      "subscores": { "fc": 6.5, "lr": 7.0, "gra": 6.0, "p": 6.5 },
      "banReason": "Repeated offensive language reported in post-call reviews",
      "appealText": "I apologize for losing my temper during the practice session. It won't happen again.",
      "createdAt": "2026-08-11T12:00:00Z"
    }
  ]
  ```
- **Endpoints**:
  - `POST /api/admin/appeals/:id/approve`
  - `POST /api/admin/appeals/:id/reject`

### 3.5 User Management & Search
- **Endpoint**: `GET /api/admin/users?query=...`
- **Response**: Array of user objects:
  ```json
  [
    {
      "id": "user_101",
      "telegramId": "123456789",
      "alias": "SilentTiger99",
      "subscores": { "fc": 7.0, "lr": 6.5, "gra": 7.5, "p": 7.0 },
      "plan": "plus",
      "status": "active",
      "warningCount": 0,
      "totalCalls": 42,
      "createdAt": "2026-07-01T10:00:00Z"
    }
  ]
  ```
- **Endpoint**: `POST /api/admin/users/:id/action`
- **Request Body**: `{ "action": "warn" | "block" | "unblock", "reason": "optional reason" }`

---

## 4. Implementation Strategy for Implementer

### Step 1: Package Dependencies Installation
Execute command:
`cmd.exe /c npm install && cmd.exe /c npm install lucide-react`

### Step 2: Types Definition (`src/types/index.ts`)
Create `src/types/index.ts` defining all contract interfaces (`AdminStats`, `PlanConfig`, `PlansSettings`, `Appeal`, `User`, `AuthResponse`). Include strict typing to comply with `verbatimModuleSyntax` and `noUnusedLocals`.

### Step 3: API Client (`src/api/client.ts`)
Implement `apiClient` supporting:
- Auto bearer token inclusion from `localStorage.getItem('admin_token')`
- Error response extraction & throwing
- Auto-logout signal on HTTP 401

### Step 4: Authentication Context (`src/context/AuthContext.tsx`)
Build `AuthContext` provider handling:
- Reading one-time `token` from `new URLSearchParams(window.location.search).get('token')`
- Storing/clearing `jwtToken` and authentication state
- `login(masterPassword: string)` method triggering `POST /api/admin/login`
- `logout()` method

### Step 5: Stealth 2FA Login Modal (`src/components/auth/LoginModal.tsx`)
Create modal UI displaying:
- Stealth login banner & warning badge
- Input field for 2FA Master Password
- Error handling display (e.g. invalid master password or missing token error)
- Submit button triggering 2FA exchange

### Step 6: Dashboard Components Development
1. `src/components/dashboard/AnalyticsOverview.tsx`:
   - Metric cards: Total Users, MAU, DAU, Active Calls.
   - Telegram Stars Revenue card: Total Stars, Total USD ($), Monthly revenue breakdown list/table with visual progress bars.
2. `src/components/dashboard/PlanEditor.tsx`:
   - Interactive form for Free, Plus, Pro tiers.
   - Number inputs for max duration (min), daily call limit, retention days (1d/7d/30d), and Stars price.
   - Form save handler submitting `PUT /api/admin/plans` with success alert feedback.
3. `src/components/dashboard/AppealsQueue.tsx`:
   - Pending appeals list with detailed user breakdown (Alias, Telegram ID, FC/LR/GRA/P sub-scores).
   - Display offense ban reason and appeal text.
   - Action buttons for `[ Approve Unblock ]` and `[ Reject Appeal ]`.
4. `src/components/dashboard/UserManagement.tsx`:
   - Search bar with instant filtering by alias or Telegram ID.
   - Table displaying user details, current status badge (Active, Warning, Blocked), plan badge.
   - Action buttons for manual moderation (`Warn`, `Block`, `Unblock`).

### Step 7: Application Entry & Layout Integration (`src/App.tsx` & `src/index.css`)
- Wrap application with `AuthProvider`.
- Top Header displaying platform title, system status, active tab switcher (`Analytics`, `Plans & Pricing`, `Unblock Appeals`, `User Management`), and Logout button.
- Unauthenticated state: display `LoginModal` overlay.
- Authenticated state: render selected dashboard tab.
- Update `src/index.css` with clean CSS styling, dark/light theme integration, card grids, table layouts, badges, and modal overlays.

### Step 8: Build & Verification
Execute build and lint verification:
- `cmd.exe /c npm run lint` (oxlint check, must be 0 errors)
- `cmd.exe /c npm run build` (`tsc -b && vite build`, must succeed with 0 errors)

---

## 5. Risk & Caveat Assessment

1. **TypeScript Strictness**: `tsconfig.app.json` has `verbatimModuleSyntax: true`. All type imports MUST use `import type { ... }`.
2. **Command Execution on Windows**: `npm` commands directly in PowerShell fail due to `.ps1` execution policy. Always prefix with `cmd.exe /c`.
3. **Empty / Initial Data Handling**: Dashboard components must handle `loading` and `error` states gracefully when backend server endpoints are not yet live or returning empty datasets.
