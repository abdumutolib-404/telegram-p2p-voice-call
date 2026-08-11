# Handoff Report — Explorer 2: M2 Frontend RadarScreen, ActiveCallScreen & Socket.io Contracts

## 1. Observation

### File & Environment Inspection
- **Project Structure**: `client/` is a Vite + React (v19) TypeScript application configured with `oxlint` and `tsc -b && vite build`.
- **Existing Files in `client/src/`**: `App.tsx`, `App.css`, `index.css`, `main.tsx`, `assets/`. `src/components/`, `src/services/`, `src/hooks/`, and `src/types/` are not yet created.
- **Dependencies (`client/package.json`)**: Currently contains base dependencies (`react`, `react-dom`). Needs `socket.io-client`, `livekit-client`, and `lucide-react` as specified in `SCOPE.md`.
- **Interface Contracts (`PROJECT.md` lines 57-63)**:
  - Socket event `join_queue`: `{ userId: string, band: number, weakSkill: string, strongSkill: string }`
  - Socket event `cancel_queue`: `{ userId: string }`
  - Socket event `match_found`: `{ roomName: string, livekitToken: string, partnerAlias: string, partnerBand: number, callDurationLimit: number }`
  - Socket event `toggle_record`: `{ roomName: string, record: boolean }`
  - Socket event `record_status`: `{ record: boolean }`
  - Socket event `finish_call`: `{ roomName: string, userId: string }`

---

## 2. Logic Chain

1. **RadarScreen Architecture**:
   - The matchmaking process requires an interactive loader displaying scanning animation while queued in the Redis $O(1)$ matchmaking bucket.
   - SVG/CSS concentric ripples radiate out from the user's avatar to visually convey live scanning.
   - When the user presses `[ ❌ Cancel Matchmaking ]`, the component invokes `socketService.cancelQueue(userId)`, which emits `cancel_queue` with `{ userId }` to immediately remove the user from the backend Redis queue, then executes the `onCancel` callback.

2. **ActiveCallScreen Architecture**:
   - Manages active voice calls once `match_found` is received.
   - Renders partner's locked alias and IELTS target band.
   - Implements a live call timer counting up in `MM:SS` format.
   - When remaining time (`callDurationLimit - elapsedSeconds`) reaches 60s or less, it visually highlights the timer with a warning badge (`AlertTriangle` icon + amber pulsing border).
   - Once `elapsedSeconds >= callDurationLimit`, the screen automatically triggers the `finishCall` workflow to prevent call overdrafts.
   - Includes a server recording toggle button `[ 🎙️ Record: ON/OFF ]` that emits `toggle_record` and listens for `record_status` to toggle an active red recording badge (`Circle animate-ping`).
   - Includes a call termination button `[ 🔴 Finish Call ]` emitting `finish_call` `{ roomName, userId }` and triggering LiveKit room disconnect.

3. **Socket.io Service Architecture (`client/src/services/socket.ts`)**:
   - Singleton pattern ensures a single active socket connection per Telegram Mini App session.
   - Automatically passes Telegram WebApp `initData` in both `extraHeaders['X-Telegram-Init-Data']` and `auth.token` for socket authentication against backend lockdown middleware.
   - Fully typed TypeScript interface contracts (`ClientToServerEvents`, `ServerToClientEvents`) ensure type safety across all socket operations.

---

## 3. Caveats

- **Media Stream Visualizer Binding**: `ActiveCallScreen.tsx` accepts an optional `audioVisualizerNode` prop so that `AudioVisualizer.tsx` (explored by Explorer 3) can be seamlessly embedded into `ActiveCallScreen`. A CSS-animated fallback waveform is provided when `audioVisualizerNode` is undefined.
- **Missing Dependencies**: `socket.io-client`, `livekit-client`, and `lucide-react` must be installed in `client/package.json` before building `client/`.

---

## 4. Conclusion

The implementation design for `RadarScreen.tsx`, `ActiveCallScreen.tsx`, and `client/src/services/socket.ts` is fully defined and aligned with `PROJECT.md` and `SCOPE.md`.

### Recommended Code Implementations

#### A. Socket Service Contract (`client/src/services/socket.ts`)
```typescript
import { io, Socket } from 'socket.io-client';

export interface ClientToServerEvents {
  join_queue: (data: {
    userId: string;
    band: number;
    weakSkill: string;
    strongSkill: string;
  }) => void;
  cancel_queue: (data: { userId: string }) => void;
  toggle_record: (data: { roomName: string; record: boolean }) => void;
  finish_call: (data: { roomName: string; userId: string }) => void;
}

export interface ServerToClientEvents {
  match_found: (data: {
    roomName: string;
    livekitToken: string;
    partnerAlias: string;
    partnerBand: number;
    callDurationLimit: number;
  }) => void;
  record_status: (data: { record: boolean }) => void;
  call_ended: (data: { reason: string }) => void;
  error: (data: { message: string }) => void;
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketService {
  private socket: AppSocket | null = null;

  public connect(initData: string): AppSocket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

    this.socket = io(serverUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      extraHeaders: {
        'X-Telegram-Init-Data': initData,
      },
      auth: {
        token: initData,
      },
    }) as AppSocket;

    return this.socket;
  }

  public getSocket(): AppSocket | null {
    return this.socket;
  }

  public joinQueue(data: {
    userId: string;
    band: number;
    weakSkill: string;
    strongSkill: string;
  }) {
    this.socket?.emit('join_queue', data);
  }

  public cancelQueue(userId: string) {
    this.socket?.emit('cancel_queue', { userId });
  }

  public toggleRecord(roomName: string, record: boolean) {
    this.socket?.emit('toggle_record', { roomName, record });
  }

  public finishCall(roomName: string, userId: string) {
    this.socket?.emit('finish_call', { roomName, userId });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();
```

#### B. Radar Screen (`client/src/components/RadarScreen.tsx`)
```tsx
import React from 'react';
import { Loader2, X, Radio, User } from 'lucide-react';
import { socketService } from '../services/socket';

interface RadarScreenProps {
  userId: string;
  userAvatarUrl?: string;
  userAlias?: string;
  targetBand?: number;
  onCancel: () => void;
}

export const RadarScreen: React.FC<RadarScreenProps> = ({
  userId,
  userAvatarUrl,
  userAlias = 'You',
  targetBand,
  onCancel,
}) => {
  const handleCancel = () => {
    socketService.cancelQueue(userId);
    onCancel();
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-screen p-6 bg-slate-900 text-white relative overflow-hidden">
      <div className="z-10 text-center mt-6">
        <div className="flex items-center justify-center gap-2 mb-2 text-indigo-400">
          <Radio className="w-5 h-5 animate-pulse" />
          <span className="text-sm font-semibold tracking-wider uppercase">Matchmaking Engine</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Finding IELTS Practice Partner</h1>
        {targetBand && (
          <p className="text-sm text-slate-400 mt-1">
            Matching Band <span className="font-semibold text-indigo-300">{targetBand}</span> complementary sub-scores
          </p>
        )}
      </div>

      <div className="relative flex items-center justify-center my-12 w-72 h-72">
        <div className="absolute w-72 h-72 rounded-full border border-indigo-500/20 animate-ping duration-1000 opacity-25" />
        <div className="absolute w-56 h-56 rounded-full border border-indigo-400/30 animate-pulse duration-700" />
        <div className="absolute w-40 h-40 rounded-full border border-indigo-300/40" />

        <svg className="absolute w-72 h-72 animate-spin-slow pointer-events-none" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="url(#radarGradient)"
            strokeWidth="1.5"
            strokeDasharray="70 200"
          />
          <defs>
            <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>

        <div className="relative z-10 w-24 h-24 rounded-full bg-slate-800 border-4 border-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center overflow-hidden">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt={userAlias} className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-indigo-300" />
          )}
        </div>
      </div>

      <div className="z-10 w-full max-w-xs flex flex-col items-center gap-4 mb-8">
        <div className="flex items-center gap-2 text-slate-300 text-sm bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Searching $O(1)$ matchmaking queue...</span>
        </div>

        <button
          onClick={handleCancel}
          className="w-full py-3.5 px-6 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <X className="w-5 h-5" />
          <span>Cancel Matchmaking</span>
        </button>
      </div>
    </div>
  );
};
```

#### C. Active Call Screen (`client/src/components/ActiveCallScreen.tsx`)
```tsx
import React, { useEffect, useState } from 'react';
import { Mic, MicOff, PhoneOff, Circle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { socketService } from '../services/socket';

interface ActiveCallScreenProps {
  roomName: string;
  userId: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit: number;
  isMicMuted: boolean;
  onToggleMic: () => void;
  onFinishCall: () => void;
  audioVisualizerNode?: React.ReactNode;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  roomName,
  userId,
  partnerAlias,
  partnerBand,
  callDurationLimit,
  isMicMuted,
  onToggleMic,
  onFinishCall,
  audioVisualizerNode,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev + 1 >= callDurationLimit) {
          clearInterval(timer);
          handleFinishCall();
          return callDurationLimit;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [callDurationLimit]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleRecordStatus = (data: { record: boolean }) => {
      setIsRecording(data.record);
      setIsTogglingRecord(false);
    };

    socket.on('record_status', handleRecordStatus);

    return () => {
      socket.off('record_status', handleRecordStatus);
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingSeconds = Math.max(0, callDurationLimit - elapsedSeconds);
  const isNearEnd = remainingSeconds <= 60;

  const handleToggleRecord = () => {
    setIsTogglingRecord(true);
    const nextState = !isRecording;
    socketService.toggleRecord(roomName, nextState);
  };

  const handleFinishCall = () => {
    socketService.finishCall(roomName, userId);
    onFinishCall();
  };

  return (
    <div className="flex flex-col justify-between min-h-screen p-6 bg-slate-950 text-white relative">
      <div className="flex flex-col items-center mt-4 gap-2 z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-4 py-1.5 rounded-full text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>LiveKit SFU Encrypted Voice Session</span>
        </div>

        <div
          className={`text-4xl font-mono font-bold tracking-wider mt-2 px-6 py-2 rounded-2xl border transition-colors ${
            isNearEnd
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse'
              : 'text-white bg-slate-900/60 border-slate-800'
          }`}
        >
          {formatTime(elapsedSeconds)}
        </div>

        {isNearEnd && (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Less than 1 minute remaining</span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center my-auto gap-6 z-10">
        <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 p-1 shadow-xl shadow-indigo-500/20">
          <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border border-indigo-400/30">
            <span className="text-3xl font-bold text-indigo-300">
              {partnerAlias.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-100">{partnerAlias}</h2>
          <div className="inline-flex items-center gap-2 mt-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-xs text-indigo-300 font-medium">
            <span>Target Band {partnerBand.toFixed(1)}</span>
            <span>•</span>
            <span className="text-emerald-400">Matched Partner</span>
          </div>
        </div>

        <div className="w-full max-w-sm h-24 bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex items-center justify-center shadow-inner">
          {audioVisualizerNode || (
            <div className="flex items-center gap-1">
              {[40, 70, 30, 90, 50, 80, 40].map((height, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-indigo-500 rounded-full animate-pulse"
                  style={{ height: `${height}%`, animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            isRecording
              ? 'bg-red-500/15 border-red-500/40 text-red-400'
              : 'bg-slate-800/80 border-slate-700 text-slate-400'
          }`}
        >
          <Circle
            className={`w-2.5 h-2.5 fill-current ${
              isRecording ? 'animate-ping text-red-500' : 'text-slate-500'
            }`}
          />
          <span>{isRecording ? 'Server Audio Recording ON' : 'Recording Inactive'}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 w-full max-w-sm mx-auto mb-6 z-10">
        <button
          onClick={onToggleMic}
          className={`p-4 rounded-2xl border transition-all active:scale-95 ${
            isMicMuted
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
          title={isMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={handleToggleRecord}
          disabled={isTogglingRecord}
          className={`px-5 py-4 rounded-2xl border font-medium text-sm flex items-center gap-2 transition-all active:scale-95 ${
            isRecording
              ? 'bg-red-500/20 border-red-500/50 text-red-300'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Circle
            className={`w-3 h-3 fill-current ${
              isRecording ? 'text-red-500' : 'text-slate-400'
            }`}
          />
          <span>{isRecording ? 'Rec: ON' : 'Rec: OFF'}</span>
        </button>

        <button
          onClick={handleFinishCall}
          className="p-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-medium shadow-lg shadow-red-600/30 transition-all active:scale-95 flex items-center justify-center"
          title="Finish Call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
```

---

## 5. Verification Method

1. **File Presence**: Confirm design specification report is saved at `D:\telegram-p2p-voice-call\.agents\explorer_m2_2\handoff.md`.
2. **Build Verification (Post-Implementation)**:
   - Run `npm run build` (`tsc -b && vite build`) in `client/` to verify zero TypeScript errors.
   - Run `npm run lint` (`oxlint`) in `client/` to ensure zero linter errors.
3. **Event Contract Compliance**: Verify event payloads match `PROJECT.md` section 1 ("Mini App ↔ Backend API & Socket Contracts").
