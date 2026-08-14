import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Circle, AlertTriangle, ShieldCheck, Volume2, Wifi } from 'lucide-react';
import { socketService } from '../services/socket';
import { AudioVisualizer } from './AudioVisualizer';
import type { RecordStatusPayload } from '../types';

interface ActiveCallScreenProps {
  roomName: string;
  userId: string;
  partnerAlias: string;
  partnerBand: number;
  callDurationLimit: number; // in seconds
  isMicMuted: boolean;
  canPlaybackAudio?: boolean;
  micError?: string | null;
  analyserNode?: AnalyserNode | null;
  onToggleMic: () => void;
  onFinishCall: () => void;
  onUnlockAudio?: () => Promise<void>;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  roomName,
  userId,
  partnerAlias,
  partnerBand,
  callDurationLimit,
  isMicMuted,
  canPlaybackAudio = true,
  micError = null,
  analyserNode,
  onToggleMic,
  onFinishCall,
  onUnlockAudio,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null);

  const hasFinishedRef = useRef(false);
  const handleFinishCall = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    socketService.finishCall(roomName, userId);
    onFinishCall();
  }, [roomName, userId, onFinishCall]);

  const handleFinishCallRef = useRef(handleFinishCall);
  useEffect(() => {
    handleFinishCallRef.current = handleFinishCall;
  }, [handleFinishCall]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (elapsedSeconds >= callDurationLimit) {
      handleFinishCallRef.current();
    }
  }, [elapsedSeconds, callDurationLimit]);

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleRecordStatus = (data: RecordStatusPayload) => {
      setIsRecording(data.record);
      setIsTogglingRecord(false);
    };

    const handleRecordingError = (data: { code?: string; message?: string }) => {
      setIsTogglingRecord(false);
      setIsRecording(false);
      setRecordingWarning(data?.message || 'Recording is currently unavailable.');
      setTimeout(() => setRecordingWarning(null), 4000);
    };

    socket.on('record_status', handleRecordStatus);
    socket.on('recording_error', handleRecordingError);

    return () => {
      socket.off('record_status', handleRecordStatus);
      socket.off('recording_error', handleRecordingError);
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
    setTimeout(() => setIsTogglingRecord(false), 3000);
  };

  return (
    <div className="flex flex-col justify-between min-h-screen p-6 bg-slate-950 text-white relative select-none">
      {/* 1. Mobile Autoplay Unlock Banner (if browser blocks audio) */}
      {!canPlaybackAudio && onUnlockAudio && (
        <button
          type="button"
          onClick={() => onUnlockAudio()}
          className="fixed top-4 inset-x-4 z-50 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-2xl shadow-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 animate-pulse"
        >
          <Volume2 className="w-5 h-5" />
          <span>Tap to Enable Partner Voice Audio</span>
        </button>
      )}

      {/* 2. Microphone Permission Warning */}
      {micError && (
        <div className="fixed top-4 inset-x-4 z-40 py-2.5 px-4 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium rounded-2xl text-xs flex items-center justify-center gap-2 text-center">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Microphone muted or permission required. Tap MUTE to unmute.</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col items-center mt-3 gap-2 z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-4 py-1.5 rounded-full text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Encrypted Voice Call</span>
          <span className="text-slate-600">•</span>
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        </div>

        {/* Big High-Contrast Timer */}
        <div
          className={`text-4xl font-mono font-bold tracking-wider mt-2 px-6 py-2 rounded-2xl border transition-colors ${
            isNearEnd
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/30 animate-pulse'
              : 'text-white bg-slate-900/60 border-slate-800'
          }`}
          aria-label={`Call duration ${formatTime(elapsedSeconds)}`}
        >
          {formatTime(elapsedSeconds)}
        </div>

        {isNearEnd ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-0.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Less than 1 minute remaining</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Remaining: {formatTime(remainingSeconds)}
          </p>
        )}
      </div>

      {/* Center Section: Partner Profile & Minimal Audio State */}
      <div className="flex flex-col items-center my-auto gap-5 z-10">
        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 p-1 shadow-xl shadow-indigo-500/20">
          <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border border-indigo-400/30">
            <span className="text-3xl font-bold text-indigo-300">
              {(partnerAlias || 'Partner').charAt(0).toUpperCase()}
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

        <div className="w-full max-w-sm h-20 bg-slate-900/80 rounded-2xl border border-slate-800 p-3 flex items-center justify-center shadow-inner">
          <AudioVisualizer analyserNode={analyserNode} isMuted={isMicMuted} />
        </div>

        {/* Subtle Recording Status */}
        <div className="flex flex-col items-center gap-1">
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
            <span>{isRecording ? 'Session Recording ON' : 'Recording Inactive'}</span>
          </div>
          {recordingWarning && (
            <span className="text-xs text-amber-400 text-center px-4 animate-fadeIn">
              {recordingWarning}
            </span>
          )}
        </div>
      </div>

      {/* Controls: Large Accessible Touch Targets */}
      <div className="flex items-center justify-center gap-4 w-full max-w-sm mx-auto mb-6 z-10">
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMicMuted}
          className={`flex-1 py-4 px-4 rounded-2xl border font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
            isMicMuted
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-400" />}
          <span>{isMicMuted ? 'UNMUTE' : 'MUTE'}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleRecord}
          disabled={isTogglingRecord}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          className={`py-4 px-4 rounded-2xl border font-medium text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
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
          <span>{isRecording ? 'REC ON' : 'REC OFF'}</span>
        </button>

        <button
          type="button"
          onClick={handleFinishCall}
          aria-label="End call"
          className="flex-1 py-4 px-4 rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold text-xs shadow-lg shadow-red-600/30 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <PhoneOff className="w-5 h-5" />
          <span>END CALL</span>
        </button>
      </div>
    </div>
  );
};
