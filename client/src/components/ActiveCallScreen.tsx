import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Circle, AlertTriangle, ShieldCheck } from 'lucide-react';
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
  analyserNode?: AnalyserNode | null;
  onToggleMic: () => void;
  onFinishCall: () => void;
}

export const ActiveCallScreen: React.FC<ActiveCallScreenProps> = ({
  roomName,
  userId,
  partnerAlias,
  partnerBand,
  callDurationLimit,
  isMicMuted,
  analyserNode,
  onToggleMic,
  onFinishCall,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [isTogglingRecord, setIsTogglingRecord] = useState(false);

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

    const handleSocketError = () => {
      setIsTogglingRecord(false);
    };

    socket.on('record_status', handleRecordStatus);
    socket.on('error', handleSocketError);

    return () => {
      socket.off('record_status', handleRecordStatus);
      socket.off('error', handleSocketError);
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
    <div className="flex flex-col justify-between min-h-screen p-6 bg-slate-950 text-white relative">
      <div className="flex flex-col items-center mt-4 gap-2 z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-4 py-1.5 rounded-full text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Encrypted P2P Voice Call</span>
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

        <div className="w-full max-w-sm h-24 bg-slate-900/80 rounded-2xl border border-slate-800 p-4 flex items-center justify-center shadow-inner">
          <AudioVisualizer analyserNode={analyserNode} isMuted={isMicMuted} />
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
