# Handoff Report — Explorer 1 (Milestone M2: Frontend Telegram Mini App)

## 1. Observation

### Existing Directory & Files Analysis (`client/`)
- **Directory**: `D:\telegram-p2p-voice-call\client`
- **Vite & React Setup**: Vite `^8.2.0`, React `^19.2.8`, TypeScript `~6.0.2`, Oxlint `^1.75.0`.
- **Existing `package.json`**:
  - `dependencies`: only `react` and `react-dom`.
  - `devDependencies`: `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `oxlint`, `typescript`, `vite`.
- **Missing Dependencies**:
  - `livekit-client` (LiveKit WebRTC SFU SDK)
  - `socket.io-client` (Socket.io client for real-time matchmaking & call signaling)
  - `lucide-react` (UI icons: `ShieldAlert`, `Mic`, `MicOff`, `PhoneOff`, `Radio`, `Timer`, `Circle`, `Volume2`, `RefreshCw`)
  - `@types/telegram-web-app` (Telegram WebApp SDK TypeScript declarations)
  - `tailwindcss` / `@tailwindcss/vite` (CSS styling framework for modern responsive Mini App UI)
- **TypeScript Configuration (`client/tsconfig.app.json`)**:
  - `"target": "es2023"`
  - `"lib": ["ES2023", "DOM"]`
  - `"verbatimModuleSyntax": true`
  - `"erasableSyntaxOnly": true`
  - *Crucial note*: Because `verbatimModuleSyntax` and `erasableSyntaxOnly` are active, type imports MUST use explicit type-only syntax (`import type { ... }`).
- **Existing App Code**: Default Vite starter template in `client/src/App.tsx` and `client/src/index.css`.

---

## 2. Logic Chain

### A. Dependencies & Build Configuration Recommendation

To support LiveKit audio streaming, Socket.io signaling, Telegram WebApp integration, Lucide icons, and Tailwind styling, `client/package.json` requires the following updates:

```json
{
  "name": "client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "livekit-client": "^2.9.2",
    "lucide-react": "^1.16.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "socket.io-client": "^4.8.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.9",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@types/telegram-web-app": "^7.10.1",
    "@vitejs/plugin-react": "^6.0.4",
    "oxlint": "^1.75.0",
    "tailwindcss": "^4.0.9",
    "typescript": "~6.0.2",
    "vite": "^8.2.0"
  }
}
```

---

### B. Telegram WebApp Lockdown Screen Architecture (`LockdownScreen.tsx` & `App.tsx`)

#### 1. Verification Strategy
Telegram Mini Apps run inside Telegram's embedded WebViews (iOS, Android, Desktop, Web). Telegram injects `window.Telegram.WebApp` into the window object and populates `window.Telegram.WebApp.initData` with HMAC-signed telemetry string.

When a user attempts direct browser access (e.g. visiting `http://localhost:5173` or public URL directly in Chrome/Safari):
- `window.Telegram` is `undefined`, OR
- `window.Telegram.WebApp` is `undefined`, OR
- `window.Telegram.WebApp.initData` is empty/blank string `""`.

#### 2. Lockdown Logic (`src/utils/telegram.ts` or `src/App.tsx`)
```ts
export function checkTelegramWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  const initData = window.Telegram?.WebApp?.initData;
  return typeof initData === 'string' && initData.trim().length > 0;
}
```

#### 3. `LockdownScreen.tsx` Requirements
- Displays a prominent 403 Access Restricted UI.
- Dark theme with crimson warning accents and a `ShieldAlert` icon.
- Copy:
  - **403 Access Restricted**
  - "This application can only be launched inside the official Telegram Mobile or Desktop app."
  - "Direct web browser access is blocked for security and authentication verification."

---

### C. State Machine & Flow Architecture

The Mini App manages state transitions across 5 core screens/states:

```
[ Unauthenticated / Browser Direct ] ─── (initData missing) ───> [ 403 LOCKDOWN ]
                                                                     │
[ Valid Telegram initData ] ─────────────────────────────────────────┼───> [ RADAR ]
                                                                             │
                                                                     (socket match_found)
                                                                             │
                                                                             ▼
                                                                     [ CONNECTING ]
                                                                             │
                                                                (livekit room connected)
                                                                             │
                                                                             ▼
                                                                     [ ACTIVE CALL ]
                                                                             │
                                                                (finish_call / timeout)
                                                                             │
                                                                             ▼
                                                                        [ ENDED ]
```

#### 1. State Model (`src/types/index.ts`)
```ts
export type AppState = 'lockdown' | 'radar' | 'connecting' | 'in_call' | 'ended';

export interface UserMatchData {
  userId: string;
  band: number;
  weakSkill: string;
  strongSkill: string;
}

export interface MatchFoundPayload {
  roomName: string;
  livekitToken: string;
  livekitUrl?: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit: number; // in seconds
}

export interface RecordStatusPayload {
  record: boolean;
}
```

#### 2. Socket Service (`src/services/socket.ts`)
- Manages Socket.io client connection to server.
- Automatically passes `X-Telegram-Init-Data` header in `extraHeaders` or socket `auth.initData`.
- Exports helper functions:
  - `initSocket(url?: string)`
  - `joinQueue(data: UserMatchData)`
  - `cancelQueue(userId: string)`
  - `toggleRecord(roomName: string, record: boolean)`
  - `finishCall(roomName: string, userId: string)`

#### 3. LiveKit WebRTC Hook (`src/hooks/useLiveKit.ts`)
- Connects to LiveKit SFU server using `Room` class from `livekit-client`.
- Captures remote audio track on `RoomEvent.TrackSubscribed` and attaches it to an HTML `<audio>` element.
- Initializes Web Audio API (`AudioContext` -> `AnalyserNode`) connected to remote audio track stream for real-time visualizer canvas.
- Manages local microphone state: `setMicrophoneEnabled(true/false)`.
- Handles clean disconnect on call finish or unmount.

#### 4. Component Structure & Responsibilities

1. **`App.tsx`**:
   - Root component & state machine coordinator.
   - Evaluates Telegram `initData` presence.
   - Initializes Socket.io connection.
   - Triggers Telegram `window.Telegram.WebApp.ready()` and `expand()`.
   - Swaps between `<LockdownScreen />`, `<RadarScreen />`, and `<ActiveCallScreen />`.

2. **`LockdownScreen.tsx`**:
   - 403 Forbidden screen for direct web access.

3. **`RadarScreen.tsx`**:
   - Concentric CSS animated radar pulse waves.
   - Central avatar with IELTS badge.
   - Pulsing matchmaking status loader.
   - `[ ❌ Cancel Matchmaking ]` button emitting `cancel_queue` socket event and closing/resetting Mini App.

4. **`ActiveCallScreen.tsx`**:
   - Partner profile card (Alias + Target Band).
   - Live Call Timer (`MM:SS`) counting up to `callDurationLimit` with color alert when < 30 seconds remain.
   - `<AudioVisualizer />` waveform canvas driven by `AnalyserNode`.
   - `[ 🎙️ Record: ON/OFF ]` toggle button with recording badge.
   - `[ 🔴 Finish Call ]` button emitting `finish_call` socket event.

5. **`AudioVisualizer.tsx`**:
   - Canvas element rendering dynamic audio frequency bars using `requestAnimationFrame`.
   - Graceful fallback animation when no active audio is playing.

---

## 3. Caveats

1. **LiveKit Server URL**: The client must receive either a full LiveKit WS URL (`ws://localhost:7880` or `wss://...`) from `match_found` payload or fallback to `import.meta.env.VITE_LIVEKIT_URL`.
2. **Audio Context Autoplay Policy**: Web browsers require user interaction before `AudioContext` resumes. Since user opens Mini App or clicks "Find Partner", audio context should be resumed upon entering `ActiveCallScreen`.
3. **Telegram WebApp SDK Script**: `index.html` should include `<script src="https://telegram.org/js/telegram-web-app.js"></script>` to ensure `window.Telegram.WebApp` is loaded natively inside Telegram WebViews.

---

## 4. Conclusion

The existing `client/` directory is a basic Vite + React starter template and is ready for M2 implementation.

### Implementation Checklist for Implementer:
1. Update `client/package.json` with dependencies (`livekit-client`, `socket.io-client`, `lucide-react`, `@types/telegram-web-app`, `@tailwindcss/vite`, `tailwindcss`).
2. Update `index.html` to include Telegram WebApp JS script and modern viewport meta tags.
3. Configure Tailwind CSS v4 in `vite.config.ts` and `src/index.css`.
4. Create `src/types/index.ts` with explicit type exports.
5. Create `src/services/socket.ts` for Socket.io signaling.
6. Create `src/hooks/useLiveKit.ts` for LiveKit SFU audio streaming and Web Audio API `AnalyserNode`.
7. Create components: `LockdownScreen.tsx`, `RadarScreen.tsx`, `ActiveCallScreen.tsx`, `AudioVisualizer.tsx`.
8. Implement state machine and lockdown guard in `src/App.tsx`.

---

## 5. Verification Method

To verify the implementation once built:
1. **Dependencies & Build**:
   - Run `npm install` inside `client/`.
   - Run `npm run build` (`tsc -b && vite build`) to confirm zero TypeScript compile or bundler errors.
   - Run `npm run lint` (`oxlint`) to verify code formatting.
2. **Lockdown Screen Verification**:
   - Launch dev server (`npm run dev`) and open `http://localhost:5173` directly in a browser.
   - Confirm `<LockdownScreen />` (403 Forbidden - Access Restricted) renders.
3. **Mini App Flow Verification**:
   - Mock `window.Telegram = { WebApp: { initData: 'query_id=123&user=...', ready: () => {}, expand: () => {} } }` in browser devtools.
   - Confirm Mini App transitions to `<RadarScreen />`.
   - Trigger simulated socket `match_found` event to verify transition to `<ActiveCallScreen />`.
