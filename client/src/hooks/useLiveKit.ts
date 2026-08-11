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

  const connect = useCallback(
    async (url: string, token: string) => {
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
    },
    [setupAudioAnalyzer]
  );

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

  const setMicMuted = useCallback(
    async (muted: boolean) => {
      if (!room) return;
      try {
        await room.localParticipant.setMicrophoneEnabled(!muted);
        setIsMicMutedState(muted);
      } catch (err) {
        console.error('Failed to set microphone state:', err);
      }
    },
    [room]
  );

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
