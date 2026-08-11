# Milestone M3: Web Admin Panel — Dashboard Components Analysis Report

**Target Directory**: `D:\telegram-p2p-voice-call\admin`  
**Author**: Explorer 3 (Milestone M3)  
**Date**: 2026-08-11  

---

## 1. Executive Summary

This report presents a comprehensive architectural and UI component specification for the four core Web Admin Panel dashboard components in `admin/src/components/dashboard/`:
1. `AnalyticsOverview.tsx`: Real-time system KPI stats and Telegram Stars revenue analytics.
2. `PlanEditor.tsx`: Dynamic plan tier configuration editor for call duration, daily call limits, audio retention, and Stars pricing.
3. `AppealsQueue.tsx`: Moderation queue to review user ban appeals with sub-scores, ban reason logs, and instant approve/reject workflow.
4. `UserManagement.tsx`: User search, filtering, and manual moderation escalation control panel.

All component designs strictly adhere to the contracts specified in `PROJECT.md` § Interface Contracts and the milestone requirements in `SCOPE.md`.

---

## 2. Shared Data Models & TypeScript Interfaces

To ensure strict type safety across all dashboard components, the following shared types are defined in `admin/src/api/types.ts`:

```typescript
export interface Subscores {
  fc: number;  // Fluency & Coherence (1.0 - 9.0)
  lr: number;  // Lexical Resource (1.0 - 9.0)
  gra: number; // Grammatical Range & Accuracy (1.0 - 9.0)
  p: number;   // Pronunciation (1.0 - 9.0)
}

export interface MonthlyRevenue {
  month: string; // e.g. "2026-07"
  stars: number;
  usd: number;
}

export interface StarsRevenue {
  totalStars: number;
  totalUsd: number;
  monthlyHistory: MonthlyRevenue[];
}

export interface AdminStats {
  totalUsers: number;
  mau: number;
  dau: number;
  activeCalls: number;
  starsRevenue: StarsRevenue;
}

export interface PlanConfig {
  maxDuration: number;   // minutes (e.g., 15, 30, 60)
  dailyLimit: number;    // calls per day
  retentionDays: number; // audio retention: 1, 7, or 30 days
  starsPrice: number;    // cost in Telegram Stars (0 for Free)
}

export interface PlansResponse {
  free: PlanConfig;
  plus: PlanConfig;
  pro: PlanConfig;
}

export interface AppealItem {
  id: string;
  userId: string;
  alias: string;
  telegramId: string;
  subscores: Subscores;
  banReason: string;
  offenseCount: number;
  appealText: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface UserItem {
  id: string;
  alias: string;
  telegramId: string;
  subscores: Subscores;
  plan: 'free' | 'plus' | 'pro';
  dnd: boolean;
  status: 'active' | 'warning' | 'temp_blocked' | 'perm_locked';
  totalCalls: number;
  createdAt: string;
  lastActiveAt: string;
}
```

---

## 3. Component Specifications

### 3.1 `AnalyticsOverview.tsx`

#### Purpose
Renders real-time system metrics (Total Users, MAU, DAU, Live Active Calls) and Telegram Stars financial analytics (Total Stars earned, USD value, monthly breakdown table/chart).

#### UI Layout & Structure
- **KPI Metrics Grid** (4 Cards):
  - Card 1: **Total Registered Users** (`totalUsers`) with `Users` icon.
  - Card 2: **Monthly Active Users (MAU)** (`mau`) & **Daily Active Users (DAU)** (`dau`) with `Activity` icon.
  - Card 3: **Active Voice Calls** (`activeCalls`) with `PhoneCall` icon and pulsing green live status indicator.
  - Card 4: **Total Telegram Stars Revenue** (`starsRevenue.totalStars`) with `Star` icon & estimated USD conversion (`$${totalUsd}`).
- **Telegram Stars Financial Breakdown Section**:
  - Highlights total Stars collected and approximate USD earnings.
  - Monthly history table with columns: `Month`, `Stars Earned (⭐)`, `Estimated USD ($)`, and percentage share bar.
- **Loading & Error States**:
  - Skeleton cards during API fetch (`GET /api/admin/stats`).
  - Error banner with `[ Retry ]` button if request fails.

#### Props & State
- Props: None (fetches data internally via `adminClient.getStats()`).
- Internal State:
  - `stats: AdminStats | null`
  - `loading: boolean`
  - `error: string | null`
  - `refreshing: boolean`

---

### 3.2 `PlanEditor.tsx`

#### Purpose
Allows administrators to view and dynamically update call duration limits, daily call limits, audio recording retention periods (1d/7d/30d), and plan pricing in Telegram Stars for Free, Plus, and Pro tiers.

#### UI Layout & Structure
- **Tier Configuration Cards Grid** (3 Columns / Cards: Free, Plus, Pro):
  - Card Header: Tier Badge (Free / Plus / Pro) with distinctive color themes (Gray / Blue / Gold).
  - Form Fields per Tier:
    1. **Max Call Duration (Minutes)**: `<input type="number">` (min: 1, max: 180).
    2. **Daily Call Limit**: `<input type="number">` (min: 1, max: 999).
    3. **Audio Recording Retention (Days)**: `<select>` options: 1 Day (Free), 7 Days (Plus), 30 Days (Pro).
    4. **Plan Price (Telegram Stars)**: `<input type="number">` (0 for Free tier).
- **Form Controls & Actions**:
  - `[ Save Plan Settings ]` primary button (triggers `PUT /api/admin/plans`).
  - `[ Reset Changes ]` button (reverts form to last saved backend state).
  - Status toast / banner notification on successful update or validation error.

#### Input Validation & Props
- Validation rules:
  - Max duration must be > 0.
  - Daily limit must be >= 1.
  - Retention days must be one of [1, 7, 30].
  - Stars price must be >= 0 (must be 0 for Free tier).
- State:
  - `plans: PlansResponse | null`
  - `formState: PlansResponse | null`
  - `isDirty: boolean`
  - `saving: boolean`
  - `message: { type: 'success' | 'error', text: string } | null`

---

### 3.3 `AppealsQueue.tsx`

#### Purpose
Provides moderation review queue for account ban appeals. Displays user IELTS sub-scores, ban reason, offense count, and submitted appeal text, with action buttons to unblock or reject.

#### UI Layout & Structure
- **Queue Header**:
  - Displays pending appeal count badge (e.g. `Pending Appeals: 3`).
  - Refresh queue button.
- **Appeals List Cards**:
  - Card Header: Permanent Alias, Telegram ID (`@tg_id` or raw ID), and submission timestamp.
  - Sub-scores Badge Row: `FC: 6.5 | LR: 7.0 | GRA: 6.0 | P: 6.5` with IELTS score badges.
  - Moderation Details: Ban Reason tag (e.g., `Warning Escalation`, `Abusive Behavior`), Offense Level badge.
  - Appeal Body Box: Quoted user appeal text.
  - Action Buttons Footer:
    - `[ Approve Unblock ]` (green primary button -> `POST /api/admin/appeals/:id/approve`).
    - `[ Reject Appeal ]` (red secondary button -> `POST /api/admin/appeals/:id/reject`).
- **Empty State**:
  - Clean illustration / check icon with text: "No pending unblock appeals."

#### Workflow & State
- Optimistic update: Upon clicking Approve or Reject, immediately remove the appeal card from the local queue and show a transient status toast.
- State:
  - `appeals: AppealItem[]`
  - `loading: boolean`
  - `actionId: string | null` (tracking active button loader)
  - `error: string | null`

---

### 3.4 `UserManagement.tsx`

#### Purpose
Admin user lookup and manual moderation escalation tool. Search by alias or Telegram ID, view user profile sub-scores and plan status, and trigger moderation actions.

#### UI Layout & Structure
- **Search & Filter Bar**:
  - Text Input: Search by plain text alias or Telegram ID with `Search` icon.
  - Filter Tabs: `All`, `Active`, `Warned`, `Temp Blocked`, `Perm Locked`.
- **User Records Data Table**:
  - Columns: `Alias`, `Telegram ID`, `Sub-scores`, `Plan Tier`, `Status`, `Total Calls`, `Last Active`, `Actions`.
- **Moderation Actions Menu / Buttons per Row**:
  - Status Badge: `Active` (green), `Warning` (yellow), `6h Blocked` (orange), `Perm Locked` (red).
  - Quick Action Dropdown / Buttons:
    - `Warn`: Issue formal warning (Ladder Level 1).
    - `Temp Block (6h)`: Apply 6-hour temporary ban (Ladder Level 2).
    - `Perm Lock`: Issue permanent lock (Ladder Level 3).
    - `Unblock`: Reset moderation status to Active.
- **Confirmation Dialog**:
  - Prompt before executing permanent lock or temporary block to prevent accidental bans.

---

## 4. API Endpoints & Contract Integration Matrix

| Endpoint | Method | Component | Payload / Query | Response Model |
|----------|--------|-----------|-----------------|----------------|
| `/api/admin/stats` | `GET` | `AnalyticsOverview` | None | `AdminStats` |
| `/api/admin/plans` | `GET` | `PlanEditor` | None | `PlansResponse` |
| `/api/admin/plans` | `PUT` | `PlanEditor` | `PlansResponse` | `{ success: boolean, plans: PlansResponse }` |
| `/api/admin/appeals` | `GET` | `AppealsQueue` | None | `AppealItem[]` |
| `/api/admin/appeals/:id/approve` | `POST` | `AppealsQueue` | None | `{ success: boolean, message: string }` |
| `/api/admin/appeals/:id/reject` | `POST` | `AppealsQueue` | None | `{ success: boolean, message: string }` |
| `/api/admin/users` | `GET` | `UserManagement` | `?query=string` | `UserItem[]` |
| `/api/admin/users/:id/moderate` | `POST` | `UserManagement` | `{ action: 'warn' \| 'block' \| 'ban' \| 'unblock' }` | `{ success: boolean, user: UserItem }` |

*Note: All endpoints require Header `Authorization: Bearer <jwtToken>`.*

---

## 5. Main Dashboard Integration (`App.tsx`)

`src/App.tsx` serves as the primary layout wrapper:
1. Header bar with system title **IELTS P2P Admin Portal** and **Logout** button.
2. Tab Navigation Bar:
   - `Overview` (`AnalyticsOverview`)
   - `Plan Editor` (`PlanEditor`)
   - `Appeals Queue` (`AppealsQueue`) - displaying badge with pending appeals count
   - `User Management` (`UserManagement`)
3. Auth Guard: Renders `LoginModal` if unauthenticated (`!jwtToken`), or the active tab component when authenticated.

---

## 6. Implementation Checklist & Recommendations for Worker

1. Install `lucide-react` dependency in `admin/package.json`.
2. Create `src/api/types.ts` containing the shared interface definitions.
3. Build components cleanly with proper TypeScript props and strict zero `any` policy.
4. Implement interactive form controls in `PlanEditor.tsx` with dirty tracking (`isDirty`).
5. Ensure responsive UI layout with dark/light glassmorphic admin styling.
6. Verify clean linting (`npm run lint` via `oxlint`) and zero TypeScript errors during `npm run build` (`tsc -b && vite build`).
