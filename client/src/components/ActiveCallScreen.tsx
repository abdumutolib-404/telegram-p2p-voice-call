import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Circle, AlertTriangle, ShieldCheck, Volume2, Wifi, BookOpen } from 'lucide-react';
import { socketService } from '../services/socket';
import { AudioVisualizer } from './AudioVisualizer';
import { QuestionsDrawer } from './QuestionsDrawer';
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
  userId,
  partnerAlias,
  partnerBand,
  callDurationLimit,
  isMicMuted,
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
  const [isRecording, setIsRecording] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);
  const [recordingWarning, setRecordingWarning] = useState<string | null>(null);
  const [showQuestionsDrawer, setShowQuestionsDrawer] = useState(false);
  const [reconnectingGraceSec, setReconnectingGraceSec] = useState<number | null>(null);

  const hasFinishedRef = useRef(false);
  const handleFinishCall = useCallback((reason?: string) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    socketService.finishCall(roomName, userId, reason);
    onFinishCall(reason);
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

    const handlePartnerConnectionLost = (data: { gracePeriodSec?: number }) => {
      setReconnectingGraceSec(data?.gracePeriodSec || 15);
    };

    const handlePartnerReconnected = () => {
      setReconnectingGraceSec(null);
    };

    socket.on('record_status', handleRecordStatus);
    socket.on('recording_error', handleRecordingError);
    socket.on('partner_connection_lost', handlePartnerConnectionLost);
    socket.on('partner_reconnected', handlePartnerReconnected);

    return () => {
      socket.off('record_status', handleRecordStatus);
      socket.off('recording_error', handleRecordingError);
      socket.off('partner_connection_lost', handlePartnerConnectionLost);
      socket.off('partner_reconnected', handlePartnerReconnected);
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
    <div className="flex flex-col justify-between min-h-screen p-6 bg-[#05070E] text-slate-100 relative select-none font-sans">
      {/* 1. Mobile Autoplay Unlock Banner (if browser blocks audio) */}
      {!canPlaybackAudio && onUnlockAudio && (
        <button
          type="button"
          onClick={() => onUnlockAudio()}
          className="fixed top-4 inset-x-4 z-50 py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold rounded-2xl shadow-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 animate-pulse motion-reduce:animate-none uppercase text-xs"
        >
          <Volume2 className="w-5 h-5" />
          <span>Tap to Enable Partner Voice Audio</span>
        </button>
      )}

      {/* 2. Microphone Permission Retry Modal */}
      {micError && micDeniedCount > 0 && micDeniedCount < 3 && onRetryMic && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-[#090D18] border border-amber-500/40 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
              <MicOff className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-mono font-bold text-white uppercase mb-2">Microphone Access Required</h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed font-mono">
              Speaking practice requires your microphone so your partner can hear you.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl py-2 px-3 mb-5 text-xs text-amber-300 font-mono font-medium">
              Attempt {micDeniedCount} of 3 • Denying 3 times ends call
            </div>
            <div className="flex flex-col gap-2 font-mono">
              <button
                type="button"
                onClick={() => onRetryMic()}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-slate-950 font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/30 flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" />
                <span>Allow Microphone Access</span>
              </button>
              <button
                type="button"
                onClick={() => handleFinishCall('microphone_permission_denied')}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 uppercase"
              >
                Cancel Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Subtle Microphone Warning if muted */}
      {micError && micDeniedCount === 0 && (
        <div className="fixed top-4 inset-x-4 z-40 py-2.5 px-4 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-medium rounded-2xl text-xs flex items-center justify-center gap-2 text-center">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Microphone muted or permission required. Tap UNMUTE to speak.</span>
        </div>
      )}

      {/* 4. Reconnecting Grace Banner */}
      {reconnectingGraceSec !== null && (
        <div className="fixed top-16 inset-x-4 z-50 py-2.5 px-4 bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono font-medium rounded-2xl text-xs flex items-center justify-center gap-2 text-center animate-pulse motion-reduce:animate-none">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
          <span>Partner network interrupted. Waiting to reconnect ({reconnectingGraceSec}s)...</span>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col items-center mt-2 gap-2 z-10 font-mono">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#090D18] border border-slate-800 px-3.5 py-1.5 rounded-full text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Encrypted SFU</span>
            <span className="text-slate-600">•</span>
            {onUnlockAudio ? (
              <button
                type="button"
                onClick={() => onUnlockAudio()}
                className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                title="Tap to verify partner audio"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Audio</span>
              </button>
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowQuestionsDrawer((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
              showQuestionsDrawer
                ? 'bg-cyan-400 text-slate-950 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.5)]'
                : 'bg-[#090D18] text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/10'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{showQuestionsDrawer ? 'Close' : 'Questions'}</span>
          </button>
        </div>

        {/* Big High-Contrast Monospace Timer */}
        <div
          className={`text-4xl font-mono font-black tracking-wider mt-2 px-6 py-2 rounded-2xl border transition-colors ${
            isNearEnd
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/40 animate-pulse motion-reduce:animate-none'
              : 'text-white bg-[#090D18] border-slate-800'
          }`}
          aria-label={`Call duration ${formatTime(elapsedSeconds)}`}
        >
          {formatTime(elapsedSeconds)}
        </div>

        {isNearEnd ? (
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 mt-0.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Less than 1 minute remaining</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Remaining: <span className="text-slate-300 font-bold">{formatTime(remainingSeconds)}</span>
          </p>
        )}
      </div>

      {/* Center Section: Partner Profile & Minimal Audio State */}
      <div className="flex flex-col items-center my-auto gap-4 z-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-600 to-purple-600 p-0.5 shadow-2xl shadow-cyan-500/20">
          <div className="w-full h-full bg-[#090D18] rounded-3xl flex items-center justify-center border border-cyan-400/30">
            <span className="text-2xl font-mono font-black text-cyan-400">
              {(partnerAlias || 'Partner').charAt(0).toUpperCase()}
            </span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-mono font-bold text-white tracking-wide">{partnerAlias}</h2>
          <div className="inline-flex items-center gap-2 mt-1.5 px-3 py-1 bg-cyan-950/40 border border-cyan-500/30 rounded-full text-xs font-mono text-cyan-300">
            <span>Target Band: <strong className="text-white">{(partnerBand || 7).toFixed(1)}</strong></span>
            <span>•</span>
            <span className="text-emerald-400 font-bold">Verified Peer</span>
          </div>
        </div>

        {/* Real-time Audio Visualizer Canvas */}
        <div className="w-full max-w-sm h-20 bg-[#090D18] rounded-2xl border border-slate-800 p-3 flex items-center justify-center shadow-inner">
          <AudioVisualizer analyserNode={analyserNode} isMuted={isMicMuted} barColor="#06b6d4" />
        </div>

        {/* Subtle Recording Status */}
        <div className="flex flex-col items-center gap-1 font-mono">
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
              isRecording
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Circle
              className={`w-2.5 h-2.5 fill-current ${
                isRecording ? 'animate-ping motion-reduce:animate-none text-rose-500' : 'text-slate-600'
              }`}
            />
            <span>{isRecording ? 'SESSION RECORDING ON' : 'RECORDING OFF'}</span>
          </div>
          {recordingWarning && (
            <span className="text-xs text-amber-400 text-center px-4 animate-fadeIn">
              {recordingWarning}
            </span>
          )}
        </div>
      </div>

      {/* Non-Intrusive IELTS Question Simulator Drawer */}
      <QuestionsDrawer
        isOpen={showQuestionsDrawer}
        onClose={() => setShowQuestionsDrawer(false)}
      />

      {/* Controls: Large Accessible Touch Targets */}
      <div className="flex items-center justify-center gap-3 w-full max-w-sm mx-auto mb-4 z-10 font-mono">
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
          aria-pressed={isMicMuted}
          className={`flex-1 py-3.5 px-3 rounded-2xl border font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer ${
            isMicMuted
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-[#090D18] border-slate-800 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {isMicMuted ? <MicOff className="w-4 h-4 text-amber-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
          <span>{isMicMuted ? 'UNMUTE' : 'MUTE'}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleRecord}
          disabled={isTogglingRecord}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          className={`py-3.5 px-3.5 rounded-2xl border font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
            isRecording
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              : 'bg-[#090D18] border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Circle
            className={`w-2.5 h-2.5 fill-current ${
              isRecording ? 'text-rose-500' : 'text-slate-500'
            }`}
          />
          <span>{isRecording ? 'REC ON' : 'REC OFF'}</span>
        </button>

        <button
          type="button"
          onClick={() => handleFinishCall()}
          aria-label="End call"
          className="flex-1 py-3.5 px-3 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-rose-600/30 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>END CALL</span>
        </button>
      </div>
    </div>
  );
};
