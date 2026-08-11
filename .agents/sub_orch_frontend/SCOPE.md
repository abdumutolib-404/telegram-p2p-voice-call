# Scope: Milestone M2 — Ultra-Minimal Telegram Mini App

## Objectives
Implement, build, lint, and verify the Telegram Mini App in `D:\telegram-p2p-voice-call\client`.

## Specific Requirements to Fulfill
1. **Dependencies & Setup**:
   - Install `livekit-client`, `socket.io-client`, `lucide-react`, Telegram WebApp SDK types, and styling tools in `client/package.json`.
2. **Mini App WebApp Lockdown Screen (`LockdownScreen.tsx`)**:
   - Check `window.Telegram?.WebApp?.initData`.
   - Render HTTP `403 Forbidden` / Access Restricted screen if opened directly in a non-Telegram web browser.
3. **Matchmaking Radar Screen (`RadarScreen.tsx`)**:
   - Animated SVG/CSS concentric radar pulse ripples with central avatar.
   - Status text loader (searching for complementary partner).
   - Instant cancellation button `[ ❌ Cancel Matchmaking ]` emitting socket event & closing/resetting view.
4. **Active Voice Call Screen (`ActiveCallScreen.tsx`)**:
   - Displays partner alias and target IELTS band.
   - Live call timer (`MM:SS`) counting up to max plan limit.
   - Real-time dynamic audio visualizer waveform canvas (`AudioVisualizer.tsx`) consuming Web Audio API frequency levels from LiveKit audio track.
   - `[ 🎙️ Record: ON/OFF ]` toggle button with active recording indicator badge.
   - `[ 🔴 Finish Call ]` button sending disconnect socket signal and ending session cleanly.
5. **LiveKit WebRTC Integration (`useLiveKit.ts`)**:
   - Hook managing LiveKit room connection, remote audio playback, microphone enable/disable, and track analyzer.

## Target File Structure
- `client/package.json`
- `client/src/App.tsx`
- `client/src/components/LockdownScreen.tsx`
- `client/src/components/RadarScreen.tsx`
- `client/src/components/ActiveCallScreen.tsx`
- `client/src/components/AudioVisualizer.tsx`
- `client/src/hooks/useLiveKit.ts`
- `client/src/services/socket.ts`
- `client/src/types/index.ts`

## Verification Criteria
- `npm run build` (`tsc -b && vite build`) succeeds with zero errors in `client/`.
- `npm run lint` runs clean with 0 errors.
