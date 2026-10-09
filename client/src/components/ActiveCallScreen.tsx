import { useModalDialog } from '../hooks/useModalDialog';
import { Brand } from './Brand';
import { PendingIcon } from './CopyLink';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Circle, AlertTriangle, Volume2, Wifi, BookOpen } from 'lucide-react';
import { socketService } from '../services/socket';
import { AudioVisualizer } from './AudioVisualizer';
import { QuestionsDrawer } from './QuestionsDrawer';
import type { RecordStatusPayload, RoomRecordingStatusPayload } from '../types';

interface ActiveCallScreenProps {
  roomName: string;
  userId: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit: number; // in seconds
  isMicMuted: boolean;
  isPartnerConnected?: boolean;
  synchronizedStartedAt?: number | null;
  canPlaybackAudio?: boolean;
  micError?: string | null;
  micDeniedCount?: number;
  analyserNode?: AnalyserNode | null;
  audioContext?: AudioContext | null;
  onToggleMic: () => void;
  onRetryMic?: () => Promise<boolean>;
  onFinishCall: (reason?: string) => void;
  onUnlockAudio?: () => Promise<void>;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  roomName,
  partnerAlias,
  partnerBand,
  callDurationLimit,
  isMicMuted,
  isPartnerConnected = false,
  synchronizedStartedAt = null,
  canPlaybackAudio = true,
  micError = null,
  micDeniedCount = 0,
  analyserNode,
  audioContext,
  onToggleMic,
  onRetryMic,
  onFinishCall,
  onUnlockAudio,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [partnerConnectedAt, setPartnerConnectedAt] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [roomRecordingState, setRoomRecordingState] = useState<RoomRecordingStatusPayload['state']>('unknown');
  const recordingStateUpdatedAt = useRef(0);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null);
  const recordingPending = useRef(false);
  const recordingDeadline = useRef<number | undefined>(undefined);
  const [micRetrying, setMicRetrying] = useState(false);
  const [micRetryError, setMicRetryError] = useState('');
  const micRetryInFlight = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [showQuestionsDrawer, setShowQuestionsDrawer] = useState(false);
  const [reconnectingGraceSec, setReconnectingGraceSec] = useState<number | null>(null);

  const hasFinishedRef = useRef(false);
  const handleFinishCall = useCallback((reason?: string) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinishCall(reason);
  }, [onFinishCall]);

  const handleFinishCallRef = useRef(handleFinishCall);
  useEffect(() => {
    handleFinishCallRef.current = handleFinishCall;
  }, [handleFinishCall]);

  useEffect(() => {
    if (isPartnerConnected && !partnerConnectedAt) {
      setPartnerConnectedAt(Date.now());
    }
  }, [isPartnerConnected, partnerConnectedAt]);

  // Synchronized countdown timer: only runs when both peers are actively connected
  useEffect(() => {
    if (!isPartnerConnected) {
      return;
    }

    const effectiveStartTime = synchronizedStartedAt || partnerConnectedAt || Date.now();
    const updateElapsed = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - effectiveStartTime) / 1000));
      setElapsedSeconds(seconds);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);

    return () => clearInterval(timer);
  }, [isPartnerConnected, synchronizedStartedAt, partnerConnectedAt]);

  // Auto-resume AudioContext and unlock audio whenever visibility transitions to 'visible' (eliminates iOS Safari silence on app switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const ctx = audioContext || (analyserNode?.context as AudioContext | undefined);
        if (ctx && typeof ctx.resume === 'function') {
          ctx.resume().catch(() => {});
        }
        if (onUnlockAudio) {
          onUnlockAudio().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [audioContext, analyserNode, onUnlockAudio]);

  // Automatically unlock browser audio playback on mount and on any user touch/click gesture
  useEffect(() => {
    const resumeAndUnlock = () => {
      const ctx = audioContext || (analyserNode?.context as AudioContext | undefined);
      if (ctx && typeof ctx.resume === 'function') {
        ctx.resume().catch(() => {});
      }
      if (onUnlockAudio) {
        onUnlockAudio().catch(() => {});
      }
    };

    // Immediate attempt on call screen entry
    resumeAndUnlock();

    window.addEventListener('click', resumeAndUnlock, { capture: true, passive: true });
    window.addEventListener('touchstart', resumeAndUnlock, { capture: true, passive: true });
    window.addEventListener('touchend', resumeAndUnlock, { capture: true, passive: true });

    return () => {
      window.removeEventListener('click', resumeAndUnlock, { capture: true });
      window.removeEventListener('touchstart', resumeAndUnlock, { capture: true });
      window.removeEventListener('touchend', resumeAndUnlock, { capture: true });
    };
  }, [audioContext, analyserNode, onUnlockAudio]);

  // Auto-finish call if microphone permission is denied 3 times
  useEffect(() => {
    if (micDeniedCount >= 3) {
      handleFinishCallRef.current('microphone_permission_denied');
    }
  }, [micDeniedCount]);

  useEffect(() => {
    if (elapsedSeconds >= callDurationLimit) {
      handleFinishCallRef.current('time_limit_reached');
    }
  }, [elapsedSeconds, callDurationLimit]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;
    recordingStateUpdatedAt.current = 0;
    setRoomRecordingState('unknown');
    setIsRecording(false);

    const handleRecordStatus = (data: RecordStatusPayload) => {
      if (data.roomName && data.roomName !== roomName) return;
      setIsRecording(data.record);
      recordingPending.current = false;
      window.clearTimeout(recordingDeadline.current);
      setRecordingWarning(null);
      setIsTogglingRecord(false);
    };

    const handleRoomRecordingStatus = (data: RoomRecordingStatusPayload) => {
      if (data.roomName !== roomName || !['on','off','unknown'].includes(data.state) || !Number.isFinite(data.updatedAt) || data.updatedAt < recordingStateUpdatedAt.current) return;
      // Equal millisecond timestamps do not prove that an off snapshot is newer.
      if (data.updatedAt === recordingStateUpdatedAt.current && data.state === 'off') return;
      recordingStateUpdatedAt.current = data.updatedAt;
      setRoomRecordingState(data.state);
    };
    const requestSnapshot = () => socketService.getRecordingStatus(roomName);
    const disconnected = () => setRoomRecordingState('unknown');
    const reconnected = () => { disconnected(); requestSnapshot(); socketService.peerReady(roomName); };

    const handleRecordingError = (data: { code?: string; message?: string }) => {
      recordingPending.current = false;
      window.clearTimeout(recordingDeadline.current);
      setIsTogglingRecord(false);
      setRecordingWarning(data?.message || 'Recording is currently unavailable.');
    };

    const handlePartnerConnectionLost = (data: { gracePeriodSec?: number }) => {
      setReconnectingGraceSec(data?.gracePeriodSec || 15);
    };

    const handlePartnerReconnected = () => {
      setReconnectingGraceSec(null);
    };

    socket.on('record_status', handleRecordStatus);
    socket.on('room_recording_status', handleRoomRecordingStatus);
    socket.on('disconnect', disconnected);
    socket.on('connect', reconnected);
    socket.on('recording_error', handleRecordingError);
    socket.on('partner_connection_lost', handlePartnerConnectionLost);
    socket.on('partner_reconnected', handlePartnerReconnected);
    requestSnapshot();
    // Recover lost cross-gateway notifications and retry partial media permission updates.
    const refresh = window.setInterval(() => { requestSnapshot(); socketService.peerReady(roomName); }, 15000);

    return () => {
      window.clearTimeout(recordingDeadline.current);
      recordingPending.current = false;
      socket.off('record_status', handleRecordStatus);
      socket.off('room_recording_status', handleRoomRecordingStatus);
      socket.off('disconnect', disconnected);
      socket.off('connect', reconnected);
      window.clearInterval(refresh);
      socket.off('recording_error', handleRecordingError);
      socket.off('partner_connection_lost', handlePartnerConnectionLost);
      socket.off('partner_reconnected', handlePartnerReconnected);
    };
  }, [roomName]);

  const microphoneDialogOpen = Boolean(micError && micDeniedCount > 0 && micDeniedCount < 3 && onRetryMic);
  const microphoneDialogRef = useModalDialog(microphoneDialogOpen, () => handleFinishCall('microphone_permission_denied'));
  const retryMicrophone = async () => {
    if (micRetryInFlight.current || !onRetryMic) return;
    micRetryInFlight.current = true;
    setMicRetrying(true); setMicRetryError('');
    try { await onRetryMic(); }
    catch { if (mounted.current) setMicRetryError('Microphone access could not be enabled. Please retry.'); }
    finally { micRetryInFlight.current = false; if (mounted.current) setMicRetrying(false); }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingSeconds = Math.max(0, callDurationLimit - elapsedSeconds);
  const isNearEnd = remainingSeconds <= 60;

  const handleToggleRecord = () => {
    if (recordingPending.current) return;
    recordingPending.current = true;
    setRecordingWarning(null);
    setIsTogglingRecord(true);
    const nextState = !isRecording;
    recordingDeadline.current = window.setTimeout(() => {
      recordingPending.current = false;
      setIsTogglingRecord(false);
      setRecordingWarning('The recording change is unconfirmed. Check your connection and retry.');
      socketService.getRecordingStatus(roomName);
    }, 6000);
    socketService.toggleRecord(roomName, nextState);
  };

  return (
    <main
      className={`app-shell call-screen ${showQuestionsDrawer ? 'questions-open' : ''}`}
    >
      <header className="app-header">
        <Brand />
        <div className="call-header-actions">
          <span className="status-pill">
            <span className="status-dot" />
            Voice practice
          </span>
          <button
            type="button"
            className="secondary-button"
            aria-expanded={showQuestionsDrawer}
            aria-controls="practice-questions"
            onClick={() => setShowQuestionsDrawer((prev) => !prev)}
          >
            <BookOpen size={17} aria-hidden="true" />
            {showQuestionsDrawer ? 'Close' : 'Questions'}
          </button>
        </div>
      </header>

      {!canPlaybackAudio && onUnlockAudio && (
        <button
          type="button"
          className="call-banner audio-unlock"
          onClick={() => onUnlockAudio()}
        >
          <Volume2 size={19} aria-hidden="true" />
          Tap to Enable Partner Voice Audio
        </button>
      )}
      {micError && micDeniedCount === 0 && (
        <div className="call-banner" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          Microphone muted or permission required. Tap Unmute to speak.
        </div>
      )}
      {reconnectingGraceSec !== null && (
        <div className="call-banner" role="status">
          <Wifi size={17} aria-hidden="true" />
          Partner reconnecting… Waiting up to {reconnectingGraceSec} seconds.
        </div>
      )}
      {microphoneDialogOpen && onRetryMic && (
        <div
          className="call-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="microphone-dialog-title"
        >
          <div ref={microphoneDialogRef} className="call-dialog-card">
            <MicOff size={32} aria-hidden="true" />
            <h2 id="microphone-dialog-title">Microphone access required</h2>
            <p>
              Speaking practice requires your microphone so your partner can
              hear you.
            </p>
            <p className="text-amber-300">
              Attempt {micDeniedCount} of 3 · Denying 3 times ends call
            </p>
            <button
              type="button"
              className="primary-button"
              disabled={micRetrying}
              aria-busy={micRetrying}
              onClick={() => void retryMicrophone()}
            >
              {micRetrying ? <PendingIcon size={18} /> : <Mic size={18} aria-hidden="true" />}
              {micRetrying ? 'Checking microphone…' : 'Allow Microphone Access'}
            </button>
            {micRetryError && <p role="alert" className="action-error">{micRetryError}</p>}
            <button
              type="button"
              className="text-button"
              onClick={() => handleFinishCall('microphone_permission_denied')}
            >
              Cancel Call
            </button>
          </div>
        </div>
      )}

      <div className="call-workspace">
        <section className="call-timing" aria-label="Session time">
          <span>
            {isPartnerConnected
              ? 'Time in conversation'
              : 'Connecting your session'}
          </span>
          <div
            className={`call-timer ${!isPartnerConnected ? 'is-connecting' : ''} ${isNearEnd ? 'text-amber-300' : ''}`}
            aria-label={`Call duration ${formatTime(elapsedSeconds)}`}
          >
            {isPartnerConnected ? formatTime(elapsedSeconds) : 'Connecting…'}
          </div>
          <p className={isNearEnd && isPartnerConnected ? 'near-end' : ''}>
            {!isPartnerConnected
              ? 'Your timer begins when both of you are connected.'
              : isNearEnd
                ? 'Less than 1 minute remaining'
                : `${formatTime(remainingSeconds)} remaining`}
          </p>
        </section>
        <section className="call-partner" aria-label="Your practice partner">
          <div className="call-avatar" aria-hidden="true">
            {(partnerAlias || 'Partner').charAt(0).toUpperCase()}
          </div>
          <h1>{partnerAlias}</h1>
          <p>Band {(partnerBand || 7).toFixed(1)} · Practice partner</p>
          <div className="call-waveform">
            <AudioVisualizer
              fitContainer
              analyserNode={analyserNode}
              isMuted={false}
              barColor="#5bd4b6"
            />
          </div>
          <p className="recording-explanation">
            {roomRecordingState === 'on'
              ? 'Audio is being recorded in this room.'
              : roomRecordingState === 'off'
                ? 'You can request your own recording using the control below.'
                : 'We’re checking the room’s recording status.'}
          </p>
        </section>
      </div>
      <QuestionsDrawer
        isOpen={showQuestionsDrawer}
        onClose={() => setShowQuestionsDrawer(false)}
      />
      <div className="call-controls-panel">
        {recordingWarning && <p role="alert" className="action-error recording-error">{recordingWarning}</p>}
        <div
          className={`recording-disclosure ${roomRecordingState === 'on' ? 'is-recording' : ''}`}
        >
          <Circle
            size={10}
            className="fill-current shrink-0"
            aria-hidden="true"
          />
          <span role="status" aria-live="polite">
            {roomRecordingState === 'on'
              ? 'ROOM RECORDING ON'
              : roomRecordingState === 'off'
                ? 'NO ROOM RECORDING REPORTED'
                : 'RECORDING STATUS UNCONFIRMED'}
          </span>
        </div>
        <div className="call-controls" aria-label="Call controls">
          <button
            type="button"
            onClick={onToggleMic}
            aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={isMicMuted}
            className={isMicMuted ? 'is-muted' : ''}
          >
            {isMicMuted ? (
              <MicOff size={20} aria-hidden="true" />
            ) : (
              <Mic size={20} className="text-mint-400" aria-hidden="true" />
            )}
            <span>{isMicMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleRecord}
            disabled={isTogglingRecord}
            aria-busy={isTogglingRecord}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            aria-pressed={isRecording}
            className={isRecording ? 'is-recording' : ''}
          >
            {isTogglingRecord ? <PendingIcon size={18} /> : <Circle
              size={18}
              className={isRecording ? 'fill-current' : ''}
              aria-hidden="true"
            />}
            <span>
              {isTogglingRecord ? 'Updating…' : isRecording ? 'Stop' : 'Record'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleFinishCall()}
            aria-label="End call"
            className="end-call"
          >
            <PhoneOff size={20} aria-hidden="true" />
            <span>End call</span>
          </button>
        </div>
      </div>
    </main>
  );
};
