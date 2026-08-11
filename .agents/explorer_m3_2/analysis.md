# Technical Analysis: Web Admin Panel Stealth 2FA Auth Architecture

**Explorer**: Explorer 2 (Milestone M3 — Web Admin Panel)  
**Target Codebase**: `D:\telegram-p2p-voice-call\admin`  
**Date**: 2026-08-11  

---

## Executive Summary

This report provides a comprehensive architectural analysis and implementation plan for the **Stealth 2FA Authentication Flow** of the Web Admin Panel (`admin/`). 
The Stealth 2FA flow is a core security requirement (R3) that prevents unauthorized direct web access to the administrative dashboard. Access requires a 1-time secret token generated via Telegram Bot `/admin` command combined with a 2FA Master Password verification to issue a JWT session token.

---

## 1. System Overview & Component Mapping

```
+-----------------------------------------------------------------------------------+
| Telegram Admin User                                                               |
|  1. Sends /admin command to Telegram Bot                                          |
|  2. Bot generates single-use token and returns link: https://admin.domain/?token=X |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
| Admin Web App (admin/)                                                            |
|                                                                                   |
|  [ URL Parsing: window.location.search -> extracts token "X" & replaces URL ]     |
|                                       |                                           |
|                                       v                                           |
|  [ AuthContext.tsx ] <---- State: urlToken = "X", isAuthenticated = false          |
|                                       |                                           |
|                                       v                                           |
|  [ LoginModal.tsx ] <----- Prompts Master Password & pre-fills urlToken           |
|                                       |                                           |
|                                       v (Submit: POST /api/admin/login)           |
|  [ api/client.ts ] -------> Backend verification (Token + Master Password)        |
|                                       |                                           |
|                                       v (Returns { token: jwtToken, expiresAt })  |
|  [ AuthContext.tsx ] <---- State: jwtToken saved to localStorage & memory         |
|                                       |                                           |
|                                       v                                           |
|  [ App.tsx ] -------------> Renders Admin Dashboard & injects Authorization header|
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Deep Dive & Code Specifications

### 2.1 `api/client.ts` — HTTP Client & Token Management

`api/client.ts` acts as the single entry point for all REST requests to the backend `/api/admin/*` endpoints. It handles automatic Bearer token injection, response parsing, and standard HTTP error handling.

#### Key Functions & Implementation Details:
1. **Token Persistence**:
   - `getStoredToken()`: Retrieves JWT string from `localStorage.getItem('admin_jwt')`.
   - `setStoredToken(token: string)`: Writes JWT string to `localStorage.setItem('admin_jwt', token)`.
   - `removeStoredToken()`: Removes JWT string via `localStorage.removeItem('admin_jwt')`.

2. **Base API Wrapper (`adminFetch`)**:
   ```typescript
   export async function adminFetch<T>(
     endpoint: string,
     options: RequestInit = {}
   ): Promise<T> {
     const token = getStoredToken();
     const headers: Record<string, string> = {
       'Content-Type': 'application/json',
       ...(options.headers as Record<string, string>),
     };

     if (token) {
       headers['Authorization'] = `Bearer ${token}`;
     }

     const baseUrl = import.meta.env.VITE_API_URL || '';
     const response = await fetch(`${baseUrl}${endpoint}`, {
       ...options,
       headers,
     });

     if (response.status === 401 || response.status === 403) {
       removeStoredToken();
       window.dispatchEvent(new Event('admin:unauthorized'));
       throw new Error('SESSION_EXPIRED');
     }

     if (!response.ok) {
       const errorData = await response.json().catch(() => ({}));
       throw new Error(errorData.error || `HTTP_${response.status}`);
     }

     return response.json();
   }
   ```

3. **API Methods**:
   - `login(token: string, masterPassword: string)`: `POST /api/admin/login` with payload `{ token, masterPassword }`. Returns `{ token: string; expiresAt: number }`.
   - `getStats()`: `GET /api/admin/stats`.
   - `getPlans()`: `GET /api/admin/plans`.
   - `updatePlans(plans)`: `PUT /api/admin/plans`.
   - `getAppeals()`: `GET /api/admin/appeals`.
   - `resolveAppeal(id, action)`: `POST /api/admin/appeals/:id/approve` or `reject`.
   - `searchUsers(query)`: `GET /api/admin/users?query=...`.
   - `moderateUser(userId, action)`: `POST /api/admin/users/:userId/action`.

---

### 2.2 `AuthContext.tsx` — Global Authentication State Provider

`AuthContext.tsx` maintains the authentication context for React components.

#### Interface Specification:
```typescript
export interface AuthContextType {
  token: string | null;
  urlToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (masterPassword: string, tokenOverride?: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}
```

#### Mounting & URL Parsing Logic:
On mount (`useEffect`):
1. **URL Parameter Extraction**:
   - Uses `const params = new URLSearchParams(window.location.search);`
   - Extracts `const tokenParam = params.get('token');`
2. **URL Cleanup**:
   - If `tokenParam` is present, store in state `urlToken`.
   - Scrub query parameters immediately:
     `window.history.replaceState({}, document.title, window.location.pathname);`
   - Prevents token leakage via browser history or screenshot.
3. **Session Hydration**:
   - Reads existing token from `localStorage` (`getStoredToken()`).
   - If present, sets `token` and `isAuthenticated = true`.
   - Adds event listener for `'admin:unauthorized'` to execute `logout()` automatically when backend returns HTTP 401.

---

### 2.3 `LoginModal.tsx` — Stealth 2FA Modal Component

`LoginModal.tsx` renders the authentication prompt when `isAuthenticated` is `false`.

#### Features & UX Flow:
1. **Visual Elements**:
   - Security badge/icon (`ShieldAlert` or `Lock` from `lucide-react`).
   - Title: "Stealth 2FA Admin Login".
   - Subtitle: "Enter Master Password & One-Time Telegram Token".
2. **Form Controls**:
   - **One-Time Token Field**:
     - Pre-filled automatically if `urlToken` exists in `AuthContext`.
     - Read-only indicator or editable input if user needs to paste token manually.
     - Badge: `✓ Token detected from URL` when auto-filled.
   - **Master Password Field**:
     - Password input with toggle button (Eye / EyeOff icon) to show/hide plaintext password.
   - **Error Alert Banner**:
     - Displays error messages (e.g. "Invalid master password", "Expired 1-time token", "Server error").
   - **Submit Button**:
     - Label: "Authenticate & Open Dashboard".
     - Disabled state during API submission with loading spinner.

---

### 2.4 `App.tsx` — Guarded Layout & Routing View

`App.tsx` controls the overall structure of the web application.

#### Structure:
```tsx
export default function App() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}

function MainDashboard() {
  const { isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'plans' | 'appeals' | 'users'>('analytics');

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <LoginModal />;
  }

  return (
    <div className="admin-container">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="content">
        {activeTab === 'analytics' && <AnalyticsOverview />}
        {activeTab === 'plans' && <PlanEditor />}
        {activeTab === 'appeals' && <AppealsQueue />}
        {activeTab === 'users' && <UserManagement />}
      </main>
    </div>
  );
}
```

---

## 3. Backend Interface Contracts & Verification

### Auth API Contract (`POST /api/admin/login`):

- **Request Headers**:
  - `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "masterPassword": "YourSecureMasterPassword"
  }
  ```
- **Response Success (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": 1754937600000
  }
  ```
- **Response Error (HTTP 401 Unauthorized)**:
  ```json
  {
    "success": false,
    "error": "INVALID_MASTER_PASSWORD"
  }
  ```
- **Response Error (HTTP 400 Bad Request / 404 Not Found)**:
  ```json
  {
    "success": false,
    "error": "INVALID_OR_EXPIRED_TOKEN"
  }
  ```

---

## 4. Edge Cases & Resilience Strategy

| Edge Case | Potential Impact | Proposed Mitigation |
|-----------|------------------|---------------------|
| User shares link `?token=...` | Security token exposure | Scrub token from URL bar immediately using `replaceState` on load. Token is one-time use only on backend. |
| User refreshes page after login | Unexpected logout | Persist JWT session token in `localStorage`. On refresh, `AuthContext` hydrates session automatically. |
| JWT token expires during active admin session | API calls silently fail with 401 | `api/client.ts` catches HTTP 401/403, dispatches `admin:unauthorized` event, `AuthContext` clears token and presents `LoginModal`. |
| Missing `lucide-react` dependency | Build/runtime error | Add `lucide-react` to `admin/package.json` dependencies. |
| Direct deep-link browser navigation without token | Unauthorized dashboard access | Guard all views in `App.tsx` behind `isAuthenticated`. Return `LoginModal` if unauthenticated. |

---

## 5. Required Implementation Steps for Implementer

1. **Update `admin/package.json`**:
   - Add `"lucide-react": "^1.16.0"` to dependencies.
2. **Create `src/api/client.ts`**:
   - Implement `adminFetch` with automatic Authorization Bearer header injection and HTTP 401 interceptor.
3. **Create `src/context/AuthContext.tsx`**:
   - Implement `AuthProvider`, URL token parsing, history scrubbing, token persistence, and login/logout methods.
4. **Create `src/components/auth/LoginModal.tsx`**:
   - Implement responsive modal UI, pre-filling URL token, password visibility toggle, error handling.
5. **Update `src/App.tsx`**:
   - Wrap root with `AuthProvider`, implement loading state and authentication guard before rendering dashboard tabs.

---

## 6. Conclusion

The proposed architecture cleanly decouples HTTP communication (`client.ts`), state management (`AuthContext.tsx`), authentication UI (`LoginModal.tsx`), and guarded view orchestration (`App.tsx`). It fully satisfies Requirement R3 and project contracts while providing robust resilience against token leaks, session expiration, and unauthorized access.
