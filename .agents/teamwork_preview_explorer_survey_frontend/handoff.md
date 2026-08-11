# Handoff Report — Frontend (Mini App) Survey

## 1. Observation

Direct observations from inspecting `D:\telegram-p2p-voice-call\client`:

### A. Core Package & Setup Analysis
- **`client/package.json`** (Lines 1-25):
  ```json
  "dependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.4",
    "oxlint": "^1.75.0",
    "typescript": "~6.0.2",
    "vite": "^8.2.0"
  }
  ```
  *Observation*: The project only contains React 19 and base Vite setup. Key production dependencies (`livekit-client`, `socket.io-client`, `@telegram-apps/sdk` or Telegram WebApp types, `lucide-react`, `tailwindcss`) are missing.

- **`client/index.html`** (Lines 1-14):
  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>client</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```
  *Observation*: Standard Vite index.html. Telegram WebApp script tag (`https://telegram.org/js/telegram-web-app.js`) is missing from `<head>`.

- **`client/src/App.tsx`** (Lines 1-123):
  *Observation*: `App.tsx` contains standard Vite default template code (React logo, counter button, documentation links). No Mini App screens exist yet.

- **`server/package.json`** (Lines 11-17):
  ```json
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "grammy": "^1.26.0",
    "socket.io": "^4.7.5"
  }
  ```
  *Observation*: Backend server uses `socket.io` for real-time communication. Frontend must integrate `socket.io-client` for radar signaling and state updates.

---

## 2. Logic Chain

1. **Missing Production Dependencies**:
   - `client/package.json` currently only lists `react` and `react-dom`.
   - To fulfill **R2** (WebRTC Voice Calling via LiveKit SFU), `livekit-client` must be added.
   - To fulfill **R2** (Matchmaking Radar signaling & recording toggles), `socket.io-client` must be added to interface with the backend.
   - To fulfill **R3** (Mini App Telegram context & security lockdown), Telegram WebApp SDK or script must be integrated to inspect `window.Telegram.WebApp.initData`.
   - To fulfill UI demands (icons for mic, record, hang up, radar waves), `lucide-react` and styling rules (Tailwind CSS or CSS animations) are required.

2. **Telegram Security Lockdown (R3)**:
   - When the client app mounts in `App.tsx`, it must check `window.Telegram?.WebApp?.initData`.
   - If `initData` is empty or missing (indicating direct web browser access outside Telegram), render a `<LockdownScreen />` (403 Forbidden - Access Restricted to Telegram Bot).

3. **Matchmaking Radar Screen Requirements (R2)**:
   - Screen state `RADAR`: Displayed when user launches Mini App from Telegram Bot `/start` menu ("Find Partner").
   - Animated SVG/CSS concentric radar pulse ripples with pulsing central avatar.
   - Status text displaying current queueing state (e.g., "Searching for complementary IELTS partner...").
   - Instant cancellation button `[ ❌ Cancel Matchmaking ]`: Sends `cancel_queue` event via socket and triggers `Telegram.WebApp.close()` or returns to idle.

4. **Active Voice Call Screen Requirements (R2 & R4)**:
   - Screen state `CALL_ACTIVE`: Triggered when socket receives `match_found` payload with LiveKit token, room name, and partner alias.
   - Display partner permanent alias (e.g., "Partner: IELTS_PRO_9") and target band.
   - Live call timer (formatted `MM:SS`) tracking elapsed call time against user plan limit.
   - Real-time dynamic audio visualizer waveform canvas: Web Audio API `AnalyserNode` connected to local/remote LiveKit audio tracks to render dynamic audio frequency bars.
   - `[ 🎙️ Record: ON/OFF ]` toggle button: Emits `toggle_record` event to backend server egress recording system with active badge indicator (`REC ●`).
   - `[ 🔴 Finish Call ]` button: Disconnects LiveKit room, stops audio tracks, sends `finish_call` socket event, and displays call end summary or closes window.

5. **LiveKit WebRTC Setup & Audio Handling**:
   - Module `useLiveKitCall` hook created around `livekit-client`.
   - Connects to LiveKit URL using room token.
   - Subscribes to remote participant audio track and attaches to `<audio autoPlay />` DOM element.
   - Enables local microphone track (`room.localParticipant.setMicrophoneEnabled(true)`).
   - Connects audio stream to Web Audio API `AudioContext` for live visualizer waveform rendering.

---

## 3. Caveats

- **Unimplemented Backend Routes**: The server socket event names (`join_queue`, `match_found`, `toggle_record`, `finish_call`, `cancel_queue`) must be kept synchronized between `client` and `server`.
- **LiveKit Server Instance**: LiveKit connection requires a running LiveKit server (or Cloud instance URL & WebSocket endpoint) provided via environment variables (`VITE_LIVEKIT_URL`).
- **Telegram WebApp Browser Testing**: Local development in desktop browser requires mocking `window.Telegram.WebApp` or setting dev bypass flags during local testing.

---

## 4. Conclusion

`D:\telegram-p2p-voice-call\client` requires immediate transformation from boilerplate Vite template into a fully functional Telegram Mini App.

### Detailed Component & Architecture Plan for Implementer:

1. **Dependency Installation**:
   - Install `livekit-client`, `socket.io-client`, `lucide-react`, `@types/telegram-web-app` (or standard script declaration).
   - Setup Tailwind CSS or keyframe CSS for radar waves and waveform animations.

2. **File Structure to Implement**:
   - `src/types/telegram.d.ts` — Telegram WebApp global type definitions.
   - `src/types/index.ts` — Interfaces for User, Match, Call State, Socket Messages.
   - `src/services/socket.ts` — Socket.io client manager connecting to server backend.
   - `src/hooks/useLiveKit.ts` — Hook wrapping `livekit-client` `Room`, track management, and mic toggle.
   - `src/components/LockdownScreen.tsx` — 403 Forbidden screen for direct browser access.
   - `src/components/RadarScreen.tsx` — Radar screen with CSS concentric ripple animation and `[ ❌ Cancel Matchmaking ]` button.
   - `src/components/ActiveCallScreen.tsx` — Active call UI displaying partner alias, live timer, record toggle `[ 🎙️ Record: ON/OFF ]`, and `[ 🔴 Finish Call ]` button.
   - `src/components/AudioVisualizer.tsx` — Real-time Web Audio API frequency waveform canvas.
   - `src/App.tsx` — Main application orchestrating Telegram WebApp initialization, state machine, and screen routing.

---

## 5. Verification Method

To independently verify the frontend project setup and build integrity:

1. **Build Verification**:
   ```powershell
   cd D:\telegram-p2p-voice-call\client
   npm run build
   ```
   *Expected Output*: TypeScript compilation (`tsc -b`) succeeds with zero errors, and Vite outputs built static assets in `dist/`.

2. **Linting Verification**:
   ```powershell
   cd D:\telegram-p2p-voice-call\client
   npm run lint
   ```
   *Expected Output*: Oxlint runs with 0 errors.

3. **File Inspection**:
   Inspect `client/src/App.tsx`, `client/src/components/RadarScreen.tsx`, `client/src/components/ActiveCallScreen.tsx`, `client/src/hooks/useLiveKit.ts` to confirm inclusion of radar animation, call timer, audio visualizer, record toggle, and Telegram WebApp lockdown logic.
