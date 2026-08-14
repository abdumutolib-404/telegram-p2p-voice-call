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

  const roomRef = useRef<Room | null>(null);
  const isConnectingRef = useRef<boolean>(false);
  const cancelConnectRef = useRef<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Handle mobile visibility change & resume AudioContext on app wake
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        audioContextRef.current &&
        audioContextRef.current.state === 'suspended'
      ) {
        audioContextRef.current.resume().catch((err) => console.warn('Failed to resume AudioContext:', err));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, []);

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

  // Teardown Web Audio API nodes, AudioContext, and audio elements
  const cleanupAudio = useCallback(() => {
    if (mediaStreamSourceRef.current) {
      try {
        mediaStreamSourceRef.current.disconnect();
      } catch (err) {
        console.warn('Error disconnecting media stream source:', err);
      }
      mediaStreamSourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch (err) {
        console.warn('Error closing audio context:', err);
      }
      audioContextRef.current = null;
    }

    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
    }

    setAnalyserNode(null);
  }, []);

  // Web Audio API setup for remote audio track
  const setupAudioAnalyzer = useCallback((remoteTrack: RemoteAudioTrack) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
          roomRef.current = null;
          setRoom(null);
          cleanupAudio();
          setIsConnected(false);
          setIsConnecting(false);
          isConnectingRef.current = false;
        });

        // Autoplay policy unlocking for mobile browsers
        livekitRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!livekitRoom?.canPlaybackAudio) {
            livekitRoom?.startAudio().catch((err) => console.warn('LiveKit startAudio failed:', err));
          }
        });

        await livekitRoom.connect(url, token);

        // Check if disconnect() was called while connect() was in-flight
        if (cancelConnectRef.current) {
          try {
            livekitRoom.disconnect();
          } catch {
            // Ignore error on cleanup
          }
          setIsConnecting(false);
          isConnectingRef.current = false;
          return;
        }

        // Enable microphone by default upon joining voice room
        await livekitRoom.localParticipant.setMicrophoneEnabled(true);
        setIsMicMutedState(false);

        // Check again if disconnect() was called while setMicrophoneEnabled was in-flight
        if (cancelConnectRef.current) {
          try {
            livekitRoom.disconnect();
          } catch {
            // Ignore error on cleanup
          }
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
          } catch {
            // Ignore error on cleanup
          }
        }
        if (!cancelConnectRef.current) {
          const msg = err instanceof Error ? err.message : 'Failed to connect to LiveKit room.';
          setError(msg);
        }
        setIsConnecting(false);
        setIsConnected(false);
        isConnectingRef.current = false;
      }
    },
    [setupAudioAnalyzer, cleanupAudio]
  );

  const toggleMic = useCallback(async () => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    try {
      const currentEnabled = activeRoom.localParticipant.isMicrophoneEnabled;
      const targetState = !currentEnabled;
      await activeRoom.localParticipant.setMicrophoneEnabled(targetState);
      setIsMicMutedState(!targetState);
    } catch (err) {
      console.error('Failed to toggle microphone state:', err);
    }
  }, []);

  const setMicMuted = useCallback(async (muted: boolean) => {
    const activeRoom = roomRef.current;
    if (!activeRoom) return;
    try {
      await activeRoom.localParticipant.setMicrophoneEnabled(!muted);
      setIsMicMutedState(muted);
    } catch (err) {
      console.error('Failed to set microphone state:', err);
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
    analyserNode,
    connect,
    disconnect,
    toggleMic,
    setMicMuted,
  };
}
