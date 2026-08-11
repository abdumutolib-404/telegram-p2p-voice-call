# Handoff Report — Explorer 3: M2 Frontend LiveKit Integration, Audio Visualizer & Verification Setup

## 1. Observation

### Existing Workspace & Environment Setup (`client/`)
- **Directory**: `D:\telegram-p2p-voice-call\client`
- **Toolchain**: Vite `^8.2.0`, React `^19.2.8`, TypeScript `~6.0.2`, Oxlint `^1.75.0`.
- **Current `client/package.json`**:
  - `dependencies`: `react` (`^19.2.8`), `react-dom` (`^19.2.8`).
  - `devDependencies`: `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `oxlint`, `typescript`, `vite`.
  - **Missing Dependencies**:
    - `livekit-client` (`^2.9.2`) — LiveKit WebRTC SFU SDK for real-time voice calls.
    - `socket.io-client` (`^4.8.1`) — Socket.io client for matchmaking & signaling.
    - `lucide-react` (`^1.16.0`) — UI icon set.
    - `@types/telegram-web-app` (`^7.10.1`) — Telegram WebApp SDK type definitions.
    - `@tailwindcss/vite` (`^4.0.9`) / `tailwindcss` (`^4.0.9`) — Styling engine.

- **TypeScript Configuration (`client/tsconfig.app.json`)**:
  - `"target": "es2023"`
  - `"moduleResolution": "bundler"`
  - `"verbatimModuleSyntax": true` — Enforces explicit type-only imports (`import type { ... }`).
  - `"erasableSyntaxOnly": true` — Disallows runtime type constructs (e.g. non-const enums, namespaces).
  - `"noUnusedLocals": true` & `"noUnusedParameters": true` — Fails build on unused variables/parameters.

- **Windows Environment Execution**:
  - Direct execution of `npm` in PowerShell fails with `PSSecurityException` due to Windows PowerShell script execution policy (`npm.ps1 cannot be loaded`).
  - Executing via `cmd /c npm --version` returns exit code 0 (`11.17.0`).

- **Target Files Under Investigation**:
  - `client/src/hooks/useLiveKit.ts` (Not yet created)
  - `client/src/components/AudioVisualizer.tsx` (Not yet created)
  - `client/package.json` scripts (`build: tsc -b && vite build`, `lint: oxlint`)

---

## 2. Logic Chain

### A. LiveKit WebRTC Integration (`useLiveKit.ts`)

#### 1. Requirements & Responsibilities
- Manage connection lifecycle to LiveKit SFU Room (`Room` class from `livekit-client`).
- Automatically handle remote participant audio track subscription and attach to an HTML `<audio>` element for playback.
- Initialize Web Audio API `AudioContext` and `AnalyserNode` connected to the remote participant audio track stream for real-time frequency analysis.
- Manage microphone capture (`setMicrophoneEnabled(true/false)`) and track `isMicMuted` state.
- Handle error states (connection failure, media permission error, disconnects) and clean up resources on disconnect or unmount.

#### 2. Detailed Implementation Design (`client/src/hooks/useLiveKit.ts`)
Due to `"verbatimModuleSyntax": true` in `tsconfig.app.json`, value imports (`Room`, `RoomEvent`, `Track`) and type imports (`RemoteTrackPublication`, `RemoteParticipant`, `RemoteAudioTrack`) MUST be strictly separated.

```typescript
import { useEffect, useRef, useState, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import type {
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
} from 'livekit-client';

export interface UseLiveKitOptions {
  roomName?: string;
  token?: string;
  serverUrl?: string;
  autoConnect?: boolean;
}

export interface UseLiveKitReturn {
  room: Room | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  isMicMuted: boolean;
  analyserNode: AnalyserNode | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
}

export function useLiveKit(options: UseLiveKitOptions = {}): UseLiveKitReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMutedState] = useState<boolean>(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Initialize persistent HTMLAudioElement for remote audio playback
  useEffect(() => {
    if (typeof window !== 'undefined' && !audioElementRef.current) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.style.display = 'none';
      document.body.appendChild(el);
      audioElementRef.current = el;
    }

    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.remove();
        audioElementRef.current = null;
      }
    };
  }, []);

  // Web Audio API setup for remote audio track
  const setupAudioAnalyzer = useCallback((remoteTrack: RemoteAudioTrack) => {
    try {
      const AudioCtx = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }

      const audioCtx = audioContextRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const mediaStream = new MediaStream([remoteTrack.mediaStreamTrack]);
      
      if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
      }

      const source = audioCtx.createMediaStreamSource(mediaStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;

      source.connect(analyser);
      // NOTE: Do NOT connect analyser to audioCtx.destination because remoteTrack.attach()
      // handles direct speaker output to prevent double audio playback / echo.

      mediaStreamSourceRef.current = source;
      setAnalyserNode(analyser);
    } catch (err) {
      console.warn('Failed to setup Web Audio AnalyserNode:', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (room) {
      room.disconnect();
      setRoom(null);
    }

    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
    }

    setAnalyserNode(null);
    setIsConnected(false);
    setIsConnecting(false);
    setIsMicMutedState(false);
  }, [room]);

  const connect = useCallback(async (url: string, token: string) => {
    if (!url || !token) {
      setError('LiveKit URL and Token are required.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const livekitRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Track subscription event
      livekitRoom.on(
        RoomEvent.TrackSubscribed,
        (
          track: Track,
          _publication: RemoteTrackPublication,
          _participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Audio) {
            const remoteAudioTrack = track as RemoteAudioTrack;
            if (audioElementRef.current) {
              remoteAudioTrack.attach(audioElementRef.current);
            }
            setupAudioAnalyzer(remoteAudioTrack);
          }
        }
      );

      // Track unsubscription event
      livekitRoom.on(
        RoomEvent.TrackUnsubscribed,
        (
          track: Track,
          _publication: RemoteTrackPublication,
          _participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Audio) {
            const remoteAudioTrack = track as RemoteAudioTrack;
            if (audioElementRef.current) {
              remoteAudioTrack.detach(audioElementRef.current);
            }
            setAnalyserNode(null);
          }
        }
      );

      // Room disconnect event
      livekitRoom.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsConnecting(false);
        setAnalyserNode(null);
      });

      await livekitRoom.connect(url, token);
      
      // Enable microphone by default upon joining voice room
      await livekitRoom.localParticipant.setMicrophoneEnabled(true);
      setIsMicMutedState(false);

      setRoom(livekitRoom);
      setIsConnected(true);
      setIsConnecting(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to LiveKit room.';
      setError(msg);
      setIsConnecting(false);
      setIsConnected(false);
    }
  }, [setupAudioAnalyzer]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    try {
      const currentEnabled = room.localParticipant.isMicrophoneEnabled;
      const targetState = !currentEnabled;
      await room.localParticipant.setMicrophoneEnabled(targetState);
      setIsMicMutedState(!targetState);
    } catch (err) {
      console.error('Failed to toggle microphone state:', err);
    }
  }, [room]);

  const setMicMuted = useCallback(async (muted: boolean) => {
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!muted);
      setIsMicMutedState(muted);
    } catch (err) {
      console.error('Failed to set microphone state:', err);
    }
  }, [room]);

  // Auto-connect if parameters provided in options
  useEffect(() => {
    if (options.autoConnect && options.serverUrl && options.token) {
      connect(options.serverUrl, options.token);
    }

    return () => {
      disconnect();
    };
  }, [options.autoConnect, options.serverUrl, options.token, connect, disconnect]);

  return {
    room,
    isConnected,
    isConnecting,
    error,
    isMicMuted,
    analyserNode,
    connect,
    disconnect,
    toggleMic,
    setMicMuted,
  };
}
```

---

### B. Real-time Audio Visualizer Component (`AudioVisualizer.tsx`)

#### 1. Requirements & Responsibilities
- Consume `AnalyserNode` from Web Audio API.
- Render dynamic frequency bars on an HTML `<canvas>` element using high-performance `requestAnimationFrame`.
- Handle high-DPI resolution scaling (`window.devicePixelRatio`) to ensure smooth visual rendering on mobile screens (Telegram WebApp).
- Provide a smooth fallback animation (idle ambient sine wave / pulsing bars) when `analyserNode` is not connected or audio is silent.
- Clean up animation frames on unmount.

#### 2. Detailed Implementation Design (`client/src/components/AudioVisualizer.tsx`)

```tsx
import React, { useEffect, useRef } from 'react';

export interface AudioVisualizerProps {
  analyserNode?: AnalyserNode | null;
  isMuted?: boolean;
  barCount?: number;
  height?: number;
  className?: string;
  barColor?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyserNode,
  isMuted = false,
  barCount = 24,
  height = 80,
  className = '',
  barColor = '#6366f1', // Indigo primary accent
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI display scaling
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = (rect.width || 300) * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const displayWidth = rect.width || 300;
    const displayHeight = height;

    const dataArray = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;

    let phase = 0;

    const renderFrame = () => {
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      if (analyserNode && dataArray && !isMuted) {
        // Active Audio Visualization Mode
        analyserNode.getByteFrequencyData(dataArray);

        const totalBins = dataArray.length;
        const step = Math.max(1, Math.floor(totalBins / barCount));
        const gap = 3;
        const barWidth = Math.max(2, (displayWidth - gap * (barCount - 1)) / barCount);

        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.min(i * step, totalBins - 1);
          const value = dataArray[binIndex] || 0;
          const percent = value / 255;
          const minHeight = 4;
          const barHeight = Math.max(minHeight, percent * (displayHeight - 12));

          const x = i * (barWidth + gap);
          const y = (displayHeight - barHeight) / 2;

          // Draw rounded pill bar
          ctx.fillStyle = barColor;
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          } else {
            ctx.rect(x, y, barWidth, barHeight);
          }
          ctx.fill();
        }
      } else {
        // Fallback Mode: Ambient Smooth Idle Sine Wave
        phase += 0.05;
        const gap = 3;
        const barWidth = Math.max(2, (displayWidth - gap * (barCount - 1)) / barCount);

        for (let i = 0; i < barCount; i++) {
          const sineVal = Math.sin(phase + (i * 0.3));
          const normalized = (sineVal + 1) / 2; // 0..1
          const barHeight = 4 + normalized * 16;

          const x = i * (barWidth + gap);
          const y = (displayHeight - barHeight) / 2;

          ctx.fillStyle = isMuted ? '#64748b' : '#818cf8'; // Slate when muted, Lavender when idle
          ctx.globalAlpha = isMuted ? 0.3 : 0.5;

          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          } else {
            ctx.rect(x, y, barWidth, barHeight);
          }
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [analyserNode, isMuted, barCount, height, barColor]);

  return (
    <div className={`w-full flex items-center justify-center ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full max-w-md h-[80px]"
        style={{ height: `${height}px` }}
      />
    </div>
  );
};
```

---

### C. Client Verification Setup (`npm run build` & `npm run lint`)

#### 1. Verification Toolchain
- **Build validation**: `npm run build` executes `tsc -b && vite build`.
  - `tsc -b`: Validates TypeScript strict mode compliance across `tsconfig.app.json`. Checks:
    - Zero explicit/implicit type mismatch.
    - Zero unused local variables (`noUnusedLocals`).
    - Zero unused parameters (`noUnusedParameters`).
    - Correct type import syntax (`verbatimModuleSyntax`).
  - `vite build`: Bundles the React Mini App into `dist/` without bundler syntax errors.
- **Linter validation**: `npm run lint` executes `oxlint`.
  - Validates React Hooks rules (`react/rules-of-hooks`).
  - Ensures component export standards and clean TypeScript practices.

#### 2. Required Dependency Installation Step
Before building or linting `client/`, the following dependencies must be added to `client/package.json`:

```json
{
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

#### 3. Execution on Windows Environment
Due to PowerShell execution policies on Windows, terminal commands must be run via `cmd /c`:
- Install dependencies: `cmd /c npm install`
- Run type check & build: `cmd /c npm run build`
- Run linter: `cmd /c npm run lint`

---

## 3. Caveats

1. **Browser Autoplay & AudioContext Policies**:
   - Modern browsers (Safari, Chrome Mobile inside Telegram WebViews) suspend `AudioContext` until user interaction occurs.
   - `useLiveKit.ts` includes `audioCtx.resume()` inside `setupAudioAnalyzer`, but the user entering the call screen (clicking "Find Partner") provides the required gesture context.
2. **Audio Output Routing & Echo Prevention**:
   - LiveKit's `remoteTrack.attach(audioElement)` outputs remote audio directly to system speakers/headphones.
   - The Web Audio `AnalyserNode` connected to `audioCtx.createMediaStreamSource` must NOT be connected to `audioCtx.destination` (`source.connect(analyser)` only). Connecting to `destination` would cause double playback and severe audio echo.
3. **Type Import Compliance (`verbatimModuleSyntax`)**:
   - `tsconfig.app.json` has `verbatimModuleSyntax: true`. Importing LiveKit types like `RemoteAudioTrack` without `import type` will fail `tsc -b`.
4. **PowerShell Script Policy**:
   - Running `npm` directly in PowerShell fails with security errors. All agent execution and documentation must specify `cmd /c npm ...`.

---

## 4. Conclusion

The design for LiveKit WebRTC SDK integration (`useLiveKit.ts`), real-time audio visualizer (`AudioVisualizer.tsx`), and verification setup (`npm run build`, `npm run lint`) is complete and fully specified.

### Checklist for Implementer:
1. Update `client/package.json` with required dependencies (`livekit-client`, `socket.io-client`, `lucide-react`, `@types/telegram-web-app`, `@tailwindcss/vite`, `tailwindcss`).
2. Create `client/src/hooks/useLiveKit.ts` adhering to type-only import syntax and Web Audio API `AnalyserNode` setup.
3. Create `client/src/components/AudioVisualizer.tsx` with canvas rendering, high-DPI scaling, and smooth fallback idle animation.
4. Execute `cmd /c npm install`, `cmd /c npm run build`, and `cmd /c npm run lint` to verify clean compilation.

---

## 5. Verification Method

To independently verify the frontend implementation:
1. **Dependencies Verification**:
   - Run `cmd /c npm install` inside `D:\telegram-p2p-voice-call\client`.
2. **Type Check & Bundler Verification**:
   - Run `cmd /c npm run build` (`tsc -b && vite build`).
   - Expected result: Output exit code `0` with `dist/` directory generated and zero TypeScript errors.
3. **Linter Verification**:
   - Run `cmd /c npm run lint` (`oxlint`).
   - Expected result: Output exit code `0` with 0 linter errors.
4. **Audio Visualizer & LiveKit Verification**:
   - Mount `<AudioVisualizer analyserNode={analyserNode} />` inside `<ActiveCallScreen />`.
   - Verify fallback sine-wave animation renders when `analyserNode` is `null` or audio is muted.
