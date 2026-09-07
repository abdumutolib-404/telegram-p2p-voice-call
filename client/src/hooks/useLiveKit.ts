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
  canPlaybackAudio: boolean;
  micError: string | null;
  micDeniedCount: number;
  analyserNode: AnalyserNode | null;
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
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMutedState] = useState<boolean>(false);
  const [canPlaybackAudio, setCanPlaybackAudio] = useState<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [micDeniedCount, setMicDeniedCount] = useState<number>(0);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const roomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const cancelConnectRef = useRef<boolean>(false);
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
    cancelConnectRef.current = true;
    isConnectingRef.current = false;

    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (err) {
        console.warn('Error disconnecting LiveKit room:', err);
      }
      roomRef.current = null;
      setRoom(null);
    }

    cleanupAudio();

    setIsConnected(false);
    setIsConnecting(false);
    setIsMicMutedState(false);
    setCanPlaybackAudio(true);
    setMicError(null);
    setMicDeniedCount(0);
  }, [cleanupAudio]);

  const connect = useCallback(
    async (url: string, token: string) => {
      if (!url || !token) {
        setError('LiveKit URL and Token are required.');
        return;
      }

      if (isConnectingRef.current || roomRef.current) {
        return;
      }

      cancelConnectRef.current = false;
      isConnectingRef.current = true;
      setIsConnecting(true);
      setError(null);
      setMicError(null);

      let livekitRoom: Room | null = null;

      try {
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

        const attachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
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
              setCanPlaybackAudio(true);
            })
            .catch((playErr) => {
              console.warn('[LiveKit] Remote audio waiting for user gesture unlock:', playErr);
              setCanPlaybackAudio(false);
            });
        };

        const detachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
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
            for (const pub of participant.audioTrackPublications.values()) {
              pub.setSubscribed(true);
              if (pub.track && pub.track.kind === Track.Kind.Audio) {
                attachAudioTrack(pub.track as RemoteAudioTrack);
              }
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
              detachAudioTrack(track as RemoteAudioTrack);
            }
          }
        );

        // Mobile autoplay permission change listener
        livekitRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (livekitRoom) {
            setCanPlaybackAudio(livekitRoom.canPlaybackAudio);
          }
        });

        // Room disconnect event
        livekitRoom.on(RoomEvent.Disconnected, () => {
          roomRef.current = null;
          setRoom(null);
          cleanupAudio();
          setIsConnected(false);
          setIsConnecting(false);
          isConnectingRef.current = false;
        });

        await livekitRoom.connect(url, token);

        // Attach any audio tracks already published by participants currently in the room
        for (const participant of livekitRoom.remoteParticipants.values()) {
          for (const publication of participant.audioTrackPublications.values()) {
            publication.setSubscribed(true);
            if (publication.track && publication.track.kind === Track.Kind.Audio) {
              attachAudioTrack(publication.track as RemoteAudioTrack);
            }
          }
        }

        // Check if disconnect() was called while connect() was in-flight
        if (cancelConnectRef.current) {
          try {
            livekitRoom.disconnect();
          } catch {}
          setIsConnecting(false);
          isConnectingRef.current = false;
          return;
        }

        // Attempt initial startAudio for mobile autoplay unlock
        try {
          await livekitRoom.startAudio();
        } catch (audioErr) {
          console.warn('Initial room.startAudio blocked by browser autoplay policy:', audioErr);
        }
        setCanPlaybackAudio(livekitRoom.canPlaybackAudio);

        // Enable microphone publication with safe mobile fallback constraints
        try {
          await livekitRoom.localParticipant.setMicrophoneEnabled(true);
          setIsMicMutedState(false);
          setMicError(null);
          setMicDeniedCount(0);
        } catch (micErr) {
          console.warn('[LiveKit] Primary microphone enable failed, trying fallback audio constraints:', micErr);
          try {
            await livekitRoom.localParticipant.setMicrophoneEnabled(true, {
              echoCancellation: true,
            });
            setIsMicMutedState(false);
            setMicError(null);
            setMicDeniedCount(0);
          } catch (fallbackErr) {
            console.error('[LiveKit] Fallback microphone enable failed:', fallbackErr);
            setIsMicMutedState(true);
            setMicError('MICROPHONE_PERMISSION_DENIED');
            setMicDeniedCount(1);
          }
        }

        // Check again if disconnect() was called while setMicrophoneEnabled was in-flight
        if (cancelConnectRef.current) {
          try {
            livekitRoom.disconnect();
          } catch {}
          setIsConnecting(false);
          isConnectingRef.current = false;
          return;
        }

        roomRef.current = livekitRoom;
        setRoom(livekitRoom);
        setIsConnected(true);
        setIsConnecting(false);
        isConnectingRef.current = false;
      } catch (err) {
        if (livekitRoom && cancelConnectRef.current) {
          try {
            livekitRoom.disconnect();
          } catch {}
        }
        if (!cancelConnectRef.current) {
          const msg = err instanceof Error ? err.message : 'Failed to connect to voice room.';
          setError(msg);
        }
        setIsConnecting(false);
        setIsConnected(false);
        isConnectingRef.current = false;
      }
    },
    [cleanupAudio]
  );

  const toggleMic = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    try {
      const currentEnabled = activeRoom.localParticipant.isMicrophoneEnabled;
      const targetState = !currentEnabled;
      await activeRoom.localParticipant.setMicrophoneEnabled(targetState);
      setIsMicMutedState(!targetState);
      setMicError(null);
    } catch (err) {
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
      setIsMicMutedState(muted);
      setMicError(null);
    } catch (err) {
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
      setIsMicMutedState(false);
      setMicError(null);
      setMicDeniedCount(0);
      return true;
    } catch (err) {
      console.warn('[LiveKit] retryMicrophone primary failed, trying fallback:', err);
      try {
        await activeRoom.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
        });
        setIsMicMutedState(false);
        setMicError(null);
        setMicDeniedCount(0);
        return true;
      } catch (fallbackErr) {
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
      connect(serverUrl, token);
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
    connect,
    disconnect,
    toggleMic,
    setMicMuted,
    retryMicrophone,
    startAudio,
    getRoom: () => roomRef.current,
  };
}
