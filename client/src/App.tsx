import React, { useEffect, useState, useCallback } from 'react';
import type { AppState, MatchFoundPayload, UserMatchData } from './types';
import { socketService } from './services/socket';
import { useLiveKit } from './hooks/useLiveKit';
import { LockdownScreen } from './components/LockdownScreen';
import { RadarScreen } from './components/RadarScreen';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { Loader2, PhoneOff, RefreshCw, AlertTriangle } from 'lucide-react';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('lockdown');
  const [initData, setInitData] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserMatchData>({
    userId: '',
    band: 6.5,
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

  // Telegram WebApp Initialization & Auth Verification
  useEffect(() => {
    const initAuth = async () => {
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
      }

      // Verify initData with server to get DB user profile (UUID)
      try {
        const serverUrl = import.meta.env.VITE_SERVER_URL || '';
        const res = await fetch(`${serverUrl}/api/auth/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telegram-init-data': rawInitData,
          },
          body: JSON.stringify({ initData: rawInitData }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setErrorMessage(errData.error || 'Authentication failed. Please start the Telegram Bot first.');
          setAppState('lockdown');
          return;
        }

        const data = await res.json();
        if (data.success && data.user) {
          setUserData({
            userId: data.user.id, // Verified DB UUID
            band: data.user.band || 6.5,
            weakSkill: 'P',
            strongSkill: 'FC',
          });
          setAppState('radar');
        } else {
          setErrorMessage('User profile not found. Please complete /start in Telegram Bot.');
          setAppState('lockdown');
        }
      } catch (err) {
        console.error('Auth verification error:', err);
        setErrorMessage('Network error connecting to backend server.');
        setAppState('lockdown');
      }
    };

    initAuth();
  }, []);

  const handleMatchFound = useCallback(
    async (data: MatchFoundPayload) => {
      setMatchData(data);
      setAppState('connecting');

      const livekitUrl =
        data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL || 'wss://p2p-clcf9vzd.livekit.cloud';

      try {
        await connectLiveKit(livekitUrl, data.livekitToken);
        setAppState('in_call');
      } catch (err) {
        console.error('Failed to connect to LiveKit SFU room:', err);
        setErrorMessage('Failed to establish encrypted audio channel with LiveKit SFU.');
        setAppState('ended');
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
    if (!initData || !userData.userId || appState === 'lockdown') return;

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
    setErrorMessage(null);
    setAppState('radar');
  };

  if (appState === 'lockdown') {
    return <LockdownScreen message={errorMessage} />;
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
        <p className="text-sm text-slate-400">Connecting to encrypted LiveKit WebRTC audio channel...</p>
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
        {errorMessage ? (
          <AlertTriangle className="w-10 h-10 text-amber-400" />
        ) : (
          <PhoneOff className="w-10 h-10 text-slate-400" />
        )}
      </div>

      <h1 className="text-2xl font-bold text-slate-100 mb-2">
        {errorMessage ? 'Call Connection Issue' : 'Call Session Ended'}
      </h1>
      <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">
        {errorMessage ||
          'Thank you for practicing! Check your Telegram chat for post-call partner evaluation and recording access.'}
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
