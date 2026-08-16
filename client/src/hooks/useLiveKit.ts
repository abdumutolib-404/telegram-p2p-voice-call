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
  analyserNode: AnalyserNode | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  toggleMic: () => Promise<void>;
  setMicMuted: (muted: boolean) => Promise<void>;
  startAudio: () => Promise<void>;
}

export function useLiveKit(options: UseLiveKitOptions = {}): UseLiveKitReturn {
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isMicMuted, setIsMicMutedState] = useState<boolean>(false);
  const [canPlaybackAudio, setCanPlaybackAudio] = useState<boolean>(true);
  const [micError, setMicError] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const roomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const cancelConnectRef = useRef<boolean>(false);
  const attachedAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Handle mobile visibility change & resume audio on app wake
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomRef.current) {
        roomRef.current.startAudio().catch(() => {});
        for (const el of attachedAudioElementsRef.current.values()) {
          el.play().catch(() => {});
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

  // Teardown attached audio elements
  const cleanupAudio = useCallback(() => {
    for (const [, el] of attachedAudioElementsRef.current) {
      try {
        el.pause();
        el.srcObject = null;
        el.remove();
      } catch {}
    }
    attachedAudioElementsRef.current.clear();
    setAnalyserNode(null);
  }, []);

  // Explicit user-gesture trigger to unlock autoplay audio on mobile browsers
  const startAudio = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (activeRoom) {
      try {
        await activeRoom.startAudio();
        setCanPlaybackAudio(activeRoom.canPlaybackAudio);
      } catch (err) {
        console.warn('[LiveKit] Failed to unlock audio playback:', err);
      }
    }
    for (const el of attachedAudioElementsRef.current.values()) {
      try {
        await el.play();
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
        });

        const attachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
          const trackSid = remoteAudioTrack.sid || `track_${Math.random().toString(36).slice(2)}`;
          const existingEl = attachedAudioElementsRef.current.get(trackSid);
          if (existingEl) {
            try {
              remoteAudioTrack.detach(existingEl);
              existingEl.remove();
            } catch {}
          }

          const el = remoteAudioTrack.attach();
          el.autoplay = true;
          (el as any).playsInline = true;
          el.setAttribute('playsinline', 'true');
          el.setAttribute('webkit-playsinline', 'true');
          el.style.position = 'fixed';
          el.style.top = '-9999px';
          el.style.left = '-9999px';
          el.style.width = '1px';
          el.style.height = '1px';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          document.body.appendChild(el);

          attachedAudioElementsRef.current.set(trackSid, el);

          el.play().catch((playErr) => {
            console.warn('[LiveKit] Remote audio play() blocked by mobile autoplay policy:', playErr);
            setCanPlaybackAudio(false);
          });
        };

        const detachAudioTrack = (remoteAudioTrack: RemoteAudioTrack) => {
          const trackSid = remoteAudioTrack.sid;
          if (trackSid && attachedAudioElementsRef.current.has(trackSid)) {
            const el = attachedAudioElementsRef.current.get(trackSid)!;
            try {
              remoteAudioTrack.detach(el);
              el.remove();
            } catch {}
            attachedAudioElementsRef.current.delete(trackSid);
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

        // Enable microphone publication with error isolation
        try {
          await livekitRoom.localParticipant.setMicrophoneEnabled(true);
          setIsMicMutedState(false);
          setMicError(null);
        } catch (micErr) {
          console.warn('Initial microphone publication failed or permission prompt pending:', micErr);
          setIsMicMutedState(true);
          setMicError('MICROPHONE_PERMISSION_DENIED');
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
    analyserNode,
    connect,
    disconnect,
    toggleMic,
    setMicMuted,
    startAudio,
  };
}
