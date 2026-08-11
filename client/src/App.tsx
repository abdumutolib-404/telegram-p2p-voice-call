import React, { useEffect, useState, useCallback } from 'react';
import type { AppState, MatchFoundPayload, UserMatchData } from './types';
import { socketService } from './services/socket';
import { useLiveKit } from './hooks/useLiveKit';
import { LockdownScreen } from './components/LockdownScreen';
import { RadarScreen } from './components/RadarScreen';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { Loader2, PhoneOff, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('lockdown');
  const [initData, setInitData] = useState<string>('');
  const [userData, setUserData] = useState<UserMatchData>({
    userId: 'user_123',
    band: 7.0,
    weakSkill: 'P',
    strongSkill: 'FC',
  });
  const [matchData, setMatchData] = useState<MatchFoundPayload | null>(null);

  const {
    connect: connectLiveKit,
    disconnect: disconnectLiveKit,
    isMicMuted,
    toggleMic,
    analyserNode,
  } = useLiveKit();

  // Telegram WebApp Initialization & Lockdown Guard
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const rawInitData = tg?.initData || '';

    if (!rawInitData || rawInitData.trim() === '') {
      setAppState('lockdown');
      return;
    }

    setInitData(rawInitData);

    if (tg) {
      tg.ready();
      tg.expand();

      // Extract user info from Telegram initDataUnsafe if available
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        setUserData((prev) => ({
          ...prev,
          userId: tgUser.id ? tgUser.id.toString() : prev.userId,
        }));
      }
    }

    setAppState('radar');
  }, []);

  const handleMatchFound = useCallback(
    async (data: MatchFoundPayload) => {
      setMatchData(data);
      setAppState('connecting');

      const livekitUrl =
        data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL || 'wss://livekit.example.com';

      try {
        await connectLiveKit(livekitUrl, data.livekitToken);
        setAppState('in_call');
      } catch (err) {
        console.error('Failed to connect to LiveKit SFU room:', err);
        setAppState('in_call'); // Fallback into call UI for signaling state
      }
    },
    [connectLiveKit]
  );

  const handleCallEnded = useCallback(() => {
    disconnectLiveKit();
    setAppState('ended');
  }, [disconnectLiveKit]);

  // Socket Connection & Event Listeners
  useEffect(() => {
    if (!initData || appState === 'lockdown') return;

    const socket = socketService.connect(initData);

    socket.on('match_found', handleMatchFound);
    socket.on('call_ended', handleCallEnded);

    // Auto-join queue when in radar state
    if (appState === 'radar') {
      socketService.joinQueue(userData);
    }

    return () => {
      socket.off('match_found', handleMatchFound);
      socket.off('call_ended', handleCallEnded);
    };
  }, [initData, appState, userData, handleMatchFound, handleCallEnded]);

  const handleCancelMatchmaking = () => {
    setAppState('ended');
  };

  const handleFinishCall = () => {
    if (matchData) {
      socketService.finishCall(matchData.roomName, userData.userId);
    }
    disconnectLiveKit();
    setAppState('ended');
  };

  const handleRestart = () => {
    setMatchData(null);
    setAppState('radar');
  };

  if (appState === 'lockdown') {
    return <LockdownScreen />;
  }

  if (appState === 'radar') {
    return (
      <RadarScreen
        userId={userData.userId}
        targetBand={userData.band}
        onCancel={handleCancelMatchmaking}
      />
    );
  }

  if (appState === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
        <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-slate-100 mb-1">Partner Matched!</h2>
        <p className="text-sm text-slate-400">Establishing LiveKit encrypted audio channel...</p>
      </div>
    );
  }

  if (appState === 'in_call' && matchData) {
    return (
      <ActiveCallScreen
        roomName={matchData.roomName}
        userId={userData.userId}
        partnerAlias={matchData.partnerAlias}
        partnerBand={matchData.partnerBand}
        callDurationLimit={matchData.callDurationLimit}
        isMicMuted={isMicMuted}
        analyserNode={analyserNode}
        onToggleMic={toggleMic}
        onFinishCall={handleFinishCall}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-6 shadow-inner">
        <PhoneOff className="w-10 h-10 text-slate-400" />
      </div>

      <h1 className="text-2xl font-bold text-slate-100 mb-2">Call Session Ended</h1>
      <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">
        Thank you for practicing! Check your Telegram chat for post-call partner evaluation and recording access.
      </p>

      <button
        onClick={handleRestart}
        className="py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
      >
        <RefreshCw className="w-5 h-5" />
        <span>Find Next Partner</span>
      </button>
    </div>
  );
};

export default App;
