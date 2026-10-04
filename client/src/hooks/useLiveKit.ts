import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  Room,
  Track,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteAudioTrack,
} from 'livekit-client';

interface ConnectionAttempt {
  key: string;
  cancelled: boolean;
  room: Room | null;
  promise: Promise<void> | null;
}

function releaseRoom(room: Room) {
  room.removeAllListeners();
  void room.disconnect().catch(() => console.warn('[LiveKit] Room disconnect could not complete.'));
}

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
  canPlaybackAudio: boolean;
  micError: string | null;
  micDeniedCount: number;
  analyserNode: AnalyserNode | null;
  isPartnerConnected: boolean;
  remoteParticipantCount: number;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
  retryMicrophone: () => Promise<boolean>;
  startAudio: () => Promise<void>;
  getRoom: () => Room | null;
}

export function useLiveKit(options: UseLiveKitOptions = {}): UseLiveKitReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isPartnerConnected, setIsPartnerConnected] = useState<boolean>(false);
  const [remoteParticipantCount, setRemoteParticipantCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMutedState] = useState<boolean>(false);
  const [canPlaybackAudio, setCanPlaybackAudio] = useState<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [micDeniedCount, setMicDeniedCount] = useState<number>(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const roomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const attemptRef = useRef<ConnectionAttempt | null>(null);
  const attachedElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Handle mobile visibility change & resume audio on app wake
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(() => {});
        }
        if (roomRef.current) {
          roomRef.current.startAudio().catch(() => {});
          for (const el of attachedElementsRef.current.values()) {
            el.play().catch(() => {});
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

  // Teardown attached audio elements and audio context
  const cleanupAudio = useCallback(() => {
    for (const [, el] of attachedElementsRef.current) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {}
    }
    attachedElementsRef.current.clear();
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close().catch(() => {});
      } catch {}
      audioCtxRef.current = null;
    }
    setAnalyserNode(null);
  }, []);

  // Explicit user-gesture trigger to unlock autoplay audio on mobile browsers
  const startAudio = useCallback(async () => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      try {
        await audioCtxRef.current.resume();
      } catch {}
    }
    const activeRoom = roomRef.current;
    if (activeRoom) {
      try {
        await activeRoom.startAudio();
        if (roomRef.current !== activeRoom) return;
        setCanPlaybackAudio(activeRoom.canPlaybackAudio);
      } catch (err) {
        console.warn('[LiveKit] Failed to unlock audio playback via startAudio():', err);
      }
    }
    for (const el of attachedElementsRef.current.values()) {
      try {
        await el.play();
        setCanPlaybackAudio(true);
      } catch {}
    }
  }, []);

  const disconnect = useCallback(() => {
    const attempt = attemptRef.current;
    attemptRef.current = null;
    if (attempt) {
      attempt.cancelled = true;
      if (attempt.room) releaseRoom(attempt.room);
    }
    isConnectingRef.current = false;

    if (roomRef.current) {
      if (roomRef.current !== attempt?.room) releaseRoom(roomRef.current);
      roomRef.current = null;
      setRoom(null);
    }

    cleanupAudio();

    setIsConnected(false);
    setIsConnecting(false);
    setIsPartnerConnected(false);
    setRemoteParticipantCount(0);
    setIsMicMutedState(false);
    setCanPlaybackAudio(true);
    setMicError(null);
    setMicDeniedCount(0);
  }, [cleanupAudio]);

  const connect = useCallback(
    (url: string, token: string): Promise<void> => {
      if (!url || !token) {
        setError('LiveKit URL and Token are required.');
        return Promise.reject(new Error('LiveKit URL and Token are required.'));
      }

      const key = `${url}\n${token}`;
      const existing = attemptRef.current;
      if (existing?.key === key && existing.promise) return existing.promise;
      if (existing) disconnect();
      const attempt: ConnectionAttempt = { key, cancelled: false, room: null, promise: null };
      attemptRef.current = attempt;
      const isCurrent = () => attemptRef.current === attempt && !attempt.cancelled;
      const ensureCurrent = () => {
        if (attempt.cancelled) throw new DOMException('Voice connection cancelled.', 'AbortError');
        if (!isCurrent()) throw new Error('Voice room disconnected while connecting.');
      };
      isConnectingRef.current = true;
      setIsConnecting(true);
      setError(null);
      setMicError(null);

      const operation = (async () => {
        let livekitRoom: Room | null = null;

        try {
          const { Room, RoomEvent, Track } = await import('livekit-client');
          ensureCurrent();
          livekitRoom = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            publishDefaults: {
              dtx: true,
            },
          });
          attempt.room = livekitRoom;

          const attachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
            if (!isCurrent()) return;
            const trackSid = remoteAudioTrack.sid || `track_${Math.random().toString(36).slice(2)}`;
            const existingEl = attachedElementsRef.current.get(trackSid);
            if (existingEl) {
              try {
                remoteAudioTrack.detach(existingEl);
                existingEl.remove();
              } catch {}
              attachedElementsRef.current.delete(trackSid);
            }

            const el = remoteAudioTrack.attach();
            el.autoplay = true;
            el.volume = 1.0;
            el.muted = false;
            el.setAttribute('playsinline', 'true');
            el.setAttribute('webkit-playsinline', 'true');
            // In-DOM persistent footprint to prevent iOS WebKit power-saver throttling
            el.style.cssText = 'position: fixed; bottom: 0; left: 0; width: 2px; height: 2px; opacity: 0.01; pointer-events: none; z-index: -10;';
            document.body.appendChild(el);
            attachedElementsRef.current.set(trackSid, el);

            // Web Audio AnalyserNode setup for live waveform visualization
            try {
              const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
              if (AudioCtx) {
                if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                  audioCtxRef.current = new AudioCtx();
                }
                const ctx = audioCtxRef.current;
                if (ctx.state === 'suspended') {
                  ctx.resume().catch(() => {});
                }
                const stream = remoteAudioTrack.mediaStream || (remoteAudioTrack.mediaStreamTrack ? new MediaStream([remoteAudioTrack.mediaStreamTrack]) : null);
                if (stream) {
                  const source = ctx.createMediaStreamSource(stream);
                  const analyser = ctx.createAnalyser();
                  analyser.fftSize = 256;
                  analyser.smoothingTimeConstant = 0.8;
                  source.connect(analyser);
                  // Note: Do not connect analyser to ctx.destination; attached <audio> plays audio
                  setAnalyserNode(analyser);
                }
              }
            } catch (audioCtxErr) {
              console.warn('[LiveKit] Failed to initialize Web Audio AnalyserNode:', audioCtxErr);
            }

            if (livekitRoom) {
              livekitRoom.startAudio().catch(() => {});
            }

            el.play()
              .then(() => {
                if (!isCurrent()) return;
                setCanPlaybackAudio(true);
              })
              .catch((playErr) => {
                if (!isCurrent()) return;
                console.warn('[LiveKit] Remote audio waiting for user gesture unlock:', playErr);
                setCanPlaybackAudio(false);
              });
          };

          const detachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
            if (!isCurrent()) return;
            const trackSid = remoteAudioTrack.sid;
            if (trackSid && attachedElementsRef.current.has(trackSid)) {
              const el = attachedElementsRef.current.get(trackSid)!;
              try {
                remoteAudioTrack.detach(el);
                el.remove();
              } catch {}
              attachedElementsRef.current.delete(trackSid);
            } else {
              try {
                const elements = remoteAudioTrack.detach();
                elements.forEach((el) => el.remove());
              } catch {}
            }
            if (attachedElementsRef.current.size === 0) {
              if (audioCtxRef.current) {
                try {
                  audioCtxRef.current.close().catch(() => {});
                } catch {}
                audioCtxRef.current = null;
              }
              setAnalyserNode(null);
            }
          };

          // Track subscription event
          livekitRoom.on(
            RoomEvent.TrackSubscribed,
            (
              track: Track,
              _publication: RemoteTrackPublication,
              _participant: RemoteParticipant
            ) => {
              if (track.kind === Track.Kind.Audio) {
                attachAudioTrack(track as RemoteAudioTrack);
              }
            }
          );

          // Track publication event (ensure auto-subscribe and immediate attach)
          livekitRoom.on(
            RoomEvent.TrackPublished,
            (publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
              if (!isCurrent()) return;
              if (publication.kind === Track.Kind.Audio) {
                publication.setSubscribed(true);
                if (publication.track) {
                  attachAudioTrack(publication.track as RemoteAudioTrack);
                }
              }
            }
          );

          // Remote participant joined room
          livekitRoom.on(
            RoomEvent.ParticipantConnected,
            (participant: RemoteParticipant) => {
              if (!isCurrent()) return;
              setIsPartnerConnected(true);
              setRemoteParticipantCount(livekitRoom?.remoteParticipants.size || 1);
              for (const pub of participant.audioTrackPublications.values()) {
                pub.setSubscribed(true);
                if (pub.track && pub.track.kind === Track.Kind.Audio) {
                  attachAudioTrack(pub.track as RemoteAudioTrack);
                }
              }
            }
          );

          // Remote participant left room
          livekitRoom.on(RoomEvent.ParticipantDisconnected, () => {
            if (!isCurrent()) return;
            const count = livekitRoom?.remoteParticipants.size || 0;
            setIsPartnerConnected(count > 0);
            setRemoteParticipantCount(count);
          });

          // Track unsubscription event
          livekitRoom.on(
            RoomEvent.TrackUnsubscribed,
            (
              track: Track,
              _publication: RemoteTrackPublication,
              _participant: RemoteParticipant
            ) => {
              if (track.kind === Track.Kind.Audio) {
                detachAudioTrack(track as RemoteAudioTrack);
              }
            }
          );

          // Mobile autoplay permission change listener
          livekitRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            if (!isCurrent()) return;
            if (livekitRoom) {
              setCanPlaybackAudio(livekitRoom.canPlaybackAudio);
            }
          });

          // Room disconnect event
          livekitRoom.on(RoomEvent.Disconnected, () => {
            if (!isCurrent()) return;
            attemptRef.current = null;
            roomRef.current = null;
            setRoom(null);
            cleanupAudio();
            setIsConnected(false);
            setIsConnecting(false);
            setIsPartnerConnected(false);
            setRemoteParticipantCount(0);
            isConnectingRef.current = false;
            setError('The voice room disconnected. Please reconnect.');
          });

          await livekitRoom.connect(url, token);
          ensureCurrent();

          const initialPeerCount = livekitRoom.remoteParticipants.size;
          setIsPartnerConnected(initialPeerCount > 0);
          setRemoteParticipantCount(initialPeerCount);

          // Attach any audio tracks already published by participants currently in the room
          for (const participant of livekitRoom.remoteParticipants.values()) {
            for (const publication of participant.audioTrackPublications.values()) {
              publication.setSubscribed(true);
              if (publication.track && publication.track.kind === Track.Kind.Audio) {
                attachAudioTrack(publication.track as RemoteAudioTrack);
              }
            }
          }

          // Attempt initial startAudio for mobile autoplay unlock
          try {
            await livekitRoom.startAudio();
          } catch (audioErr) {
            console.warn('Initial room.startAudio blocked by browser autoplay policy:', audioErr);
          }
          ensureCurrent();
          setCanPlaybackAudio(livekitRoom.canPlaybackAudio);

          // Enable microphone publication with safe mobile fallback constraints
          try {
            await livekitRoom.localParticipant.setMicrophoneEnabled(true);
            ensureCurrent();
            setIsMicMutedState(false);
            setMicError(null);
            setMicDeniedCount(0);
          } catch (micErr) {
            ensureCurrent();
            console.warn('[LiveKit] Primary microphone enable failed, trying fallback audio constraints:', micErr);
            try {
              await livekitRoom.localParticipant.setMicrophoneEnabled(true, {
                echoCancellation: true,
              });
              ensureCurrent();
              setIsMicMutedState(false);
              setMicError(null);
              setMicDeniedCount(0);
            } catch (fallbackErr) {
              ensureCurrent();
              console.error('[LiveKit] Fallback microphone enable failed:', fallbackErr);
              setIsMicMutedState(true);
              setMicError('MICROPHONE_PERMISSION_DENIED');
              setMicDeniedCount(1);
            }
          }

          ensureCurrent();

          roomRef.current = livekitRoom;
          setRoom(livekitRoom);
          setIsConnected(true);
          setIsConnecting(false);
          isConnectingRef.current = false;
        } catch (err) {
          if (livekitRoom) releaseRoom(livekitRoom);
          if (isCurrent()) {
            attemptRef.current = null;
            roomRef.current = null;
            setRoom(null);
            cleanupAudio();
            const msg = err instanceof Error ? err.message : 'Failed to connect to voice room.';
            setError(msg);
            setIsConnecting(false);
            setIsConnected(false);
            isConnectingRef.current = false;
          }
          if (attempt.cancelled) throw new DOMException('Voice connection cancelled.', 'AbortError');
          throw err;
        }
      })();
      attempt.promise = operation;
      return operation;
    },
    [cleanupAudio, disconnect]
  );

  const toggleMic = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    try {
      const currentEnabled = activeRoom.localParticipant.isMicrophoneEnabled;
      const targetState = !currentEnabled;
      await activeRoom.localParticipant.setMicrophoneEnabled(targetState);
      if (roomRef.current !== activeRoom) return;
      setIsMicMutedState(!targetState);
      setMicError(null);
    } catch (err) {
      if (roomRef.current !== activeRoom) return;
      console.error('Failed to toggle microphone state:', err);
      setMicError('MICROPHONE_PERMISSION_DENIED');
      setMicDeniedCount((prev) => prev + 1);
    }
  }, []);

  const setMicMuted = useCallback(async (muted: boolean) => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    try {
      await activeRoom.localParticipant.setMicrophoneEnabled(!muted);
      if (roomRef.current !== activeRoom) return;
      setIsMicMutedState(muted);
      setMicError(null);
    } catch (err) {
      if (roomRef.current !== activeRoom) return;
      console.error('Failed to set microphone state:', err);
      setMicError('MICROPHONE_PERMISSION_DENIED');
      setMicDeniedCount((prev) => prev + 1);
    }
  }, []);

  const retryMicrophone = useCallback(async (): Promise<boolean> => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return false;
    try {
      await activeRoom.localParticipant.setMicrophoneEnabled(true);
      if (roomRef.current !== activeRoom) return false;
      setIsMicMutedState(false);
      setMicError(null);
      setMicDeniedCount(0);
      return true;
    } catch (err) {
      if (roomRef.current !== activeRoom) return false;
      console.warn('[LiveKit] retryMicrophone primary failed, trying fallback:', err);
      try {
        await activeRoom.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
        });
        if (roomRef.current !== activeRoom) return false;
        setIsMicMutedState(false);
        setMicError(null);
        setMicDeniedCount(0);
        return true;
      } catch (fallbackErr) {
        if (roomRef.current !== activeRoom) return false;
        console.error('[LiveKit] retryMicrophone fallback failed:', fallbackErr);
        setIsMicMutedState(true);
        setMicError('MICROPHONE_PERMISSION_DENIED');
        setMicDeniedCount((prev) => prev + 1);
        return false;
      }
    }
  }, []);

  const autoConnect = options.autoConnect;
  const serverUrl = options.serverUrl;
  const token = options.token;

  // Auto-connect if parameters provided in options
  useEffect(() => {
    if (autoConnect && serverUrl && token) {
      void connect(serverUrl, token).catch(() => { /* Connection errors are surfaced through hook state. */ });
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, serverUrl, token, connect, disconnect]);

  return {
    room,
    isConnected,
    isConnecting,
    error,
    isMicMuted,
    canPlaybackAudio,
    micError,
    micDeniedCount,
    analyserNode,
    isPartnerConnected,
    remoteParticipantCount,
    connect,
    disconnect,
    toggleMic,
    setMicMuted,
    retryMicrophone,
    startAudio,
    getRoom: () => roomRef.current,
  };
}
