# Handoff Report — Explorer 2 (Milestone M3: Web Admin Panel)

**Agent ID**: `explorer_m3_2`  
**Target Module**: `admin/` (Web Admin Panel Stealth 2FA Auth Architecture)  
**Date**: 2026-08-11  

---

## 1. Observation

1. **Initial Codebase State**:
   - Analyzed `D:\telegram-p2p-voice-call\admin\package.json`. Line 12-15 contains base dependencies (`react: ^19.2.8`, `react-dom: ^19.2.8`). `lucide-react` is currently missing.
   - Analyzed `D:\telegram-p2p-voice-call\admin\src\App.tsx` (lines 1-123). Currently contains default Vite template counter/documentation demo code.
   - Analyzed `D:\telegram-p2p-voice-call\admin\src\main.tsx` (lines 1-11). Mounts `<App />` inside React `StrictMode`.

2. **Project Specification Requirements**:
   - `ORIGINAL_REQUEST.md` Requirement R3 (lines 31-36): "Stealth `/admin` command: returns unrecognized command response for regular users; sends one-time secret admin link to authorized Telegram IDs. Master Password prompt (2FA) before issuing session token."
   - `PROJECT.md` Feature #13 (line 29) & Contract #2 (lines 64-69):
     - `POST /api/admin/login`: Payload `{ token, masterPassword }` -> Returns `{ jwtToken, expiresAt }`.
     - All admin endpoints require Header `Authorization: Bearer <jwtToken>`.
   - `SCOPE.md` Item 2 & Target File Structure (lines 9-34):
     - Parse 1-time token parameter `?token=...` from `window.location.search`.
     - Present 2FA Master Password prompt.
     - Post credentials to `POST /api/admin/login` to obtain JWT session token.
     - Guard administrative features behind JWT authorization header (`Authorization: Bearer <token>`).
     - Target files: `admin/src/App.tsx`, `admin/src/api/client.ts`, `admin/src/context/AuthContext.tsx`, `admin/src/components/auth/LoginModal.tsx`.

---

## 2. Logic Chain

1. **Observation 1 & 2** establish that `admin/` is currently a template workspace requiring complete implementation of the Stealth 2FA Auth flow, including `AuthContext.tsx`, `LoginModal.tsx`, `api/client.ts`, and guarded routing in `App.tsx`.
2. **URL Parameter Handling**: The 1-time secret token sent via Telegram bot link is formatted as `?token=...`. `AuthContext.tsx` must parse `window.location.search` on initial render. To prevent token leakage in browser history or referrer headers, `window.history.replaceState` must immediately scrub `?token=...` from the URL bar after extraction into React state.
3. **Master Password Prompt (2FA Step)**: `LoginModal.tsx` provides the 2FA user interface. It auto-detects `urlToken` from `AuthContext`, allows manual token entry/editing if needed, prompts for `masterPassword` (with visibility toggle), and submits the credentials to `POST /api/admin/login`.
4. **JWT Session Persistence & Header Injection**: Upon successful login, `api/client.ts` stores the JWT session token in `localStorage` (`admin_jwt`). Every request made via `api/client.ts` (`adminFetch`) injects `Authorization: Bearer <jwtToken>`.
5. **Session Invalidation & Automatic Logout**: If the backend returns `401 Unauthorized` or `403 Forbidden` on any admin endpoint, `api/client.ts` dispatches an `admin:unauthorized` event, clearing stored tokens and resetting `AuthContext` to `isAuthenticated = false`.
6. **Guard Architecture**: `App.tsx` checks `AuthContext.isAuthenticated`. If false or unauthenticated, it renders `LoginModal`. If true, it renders the protected Admin Dashboard layout.

---

## 3. Caveats

- Backend endpoints in `server/` are being implemented in parallel under Milestone M1/M3 backend tasks. Mocking or dev server configuration (`VITE_API_URL`) may be required during standalone frontend development.
- `localStorage` is used for client-side JWT persistence across page refreshes. In production environments with strict XSS policies, HTTP-only cookies can be an alternative, but `localStorage` + Bearer header matches `PROJECT.md` Interface Contracts (line 68).

---

## 4. Conclusion

The architecture for Stealth 2FA auth flow in `admin/` is fully designed and documented in `analysis.md`. The design comprises four core files:
1. `admin/src/api/client.ts`: Centralized fetch wrapper with Bearer token injection and 401 interceptor.
2. `admin/src/context/AuthContext.tsx`: React Context for URL token parsing, history scrubbing, token persistence, and auth state.
3. `admin/src/components/auth/LoginModal.tsx`: 2FA login modal pre-filling URL tokens and handling password submission.
4. `admin/src/App.tsx`: Auth guard wrapping dashboard components.

---

## 5. Verification Method

To verify the implementation once written by the Implementer:

1. **Install Dependencies**:
   ```bash
   cd D:\telegram-p2p-voice-call\admin
   npm install lucide-react
   ```

2. **Build Verification**:
   ```bash
   npm run build
   ```
   Must complete cleanly with 0 TypeScript/Vite errors (`tsc -b && vite build`).

3. **Lint Verification**:
   ```bash
   npm run lint
   ```
   Must complete cleanly with 0 oxlint warnings or errors.

4. **Functional Checklist**:
   - Navigating to `http://localhost:5173/?token=test-token-123` correctly extracts `test-token-123` into `LoginModal` and replaces the URL to `http://localhost:5173/`.
   - Submitting incorrect password triggers error banner in `LoginModal`.
   - Submitting valid credentials stores JWT in `localStorage` under `admin_jwt` and transitions `App.tsx` to the dashboard view.
   - Outgoing API requests contain `Authorization: Bearer <jwtToken>` in request headers.
