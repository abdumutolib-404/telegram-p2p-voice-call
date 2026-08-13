import React, { useEffect, useState, useCallback } from 'react';
import type { AppState, MatchFoundPayload, UserMatchData } from './types';
import { socketService } from './services/socket';
import { useLiveKit } from './hooks/useLiveKit';
import { LockdownScreen, type LockdownReason } from './components/LockdownScreen';
import { RadarScreen } from './components/RadarScreen';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { logger } from './services/logger';
import { Loader2, PhoneOff, RefreshCw, AlertTriangle } from 'lucide-react';

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('idle');
  const [lockdownReason, setLockdownReason] = useState<LockdownReason>('browser_direct');
  const [initData, setInitData] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserMatchData>({
    userId: '',
    band: 6.5,
    weakSkill: 'P',
    strongSkill: 'FC',
  });
  const [matchData, setMatchData] = useState<MatchFoundPayload | null>(null);

  const appStateRef = React.useRef<AppState>(appState);
  const hasJoinedQueueRef = React.useRef(false);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  const {
    connect: connectLiveKit,
    disconnect: disconnectLiveKit,
    isMicMuted,
    toggleMic,
    analyserNode,
  } = useLiveKit();

  const handleMatchFound = useCallback(
    async (data: MatchFoundPayload) => {
      if (appStateRef.current === 'ended' || appStateRef.current === 'idle') {
        console.warn(`Ignoring late match_found event because app state is ${appStateRef.current}`);
        return;
      }

      setMatchData(data);
      setAppState('connecting');

      const livekitUrl =
        data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL || 'wss://p2p-clcf9vzd.livekit.cloud';

      try {
        await connectLiveKit(livekitUrl, data.livekitToken);

        const currentState = appStateRef.current as AppState;
        if (currentState === 'ended' || currentState === 'idle') {
          disconnectLiveKit();
          return;
        }

        setAppState('in_call');
      } catch (err) {
        console.error('Failed to connect to LiveKit SFU room:', err);
        setErrorMessage('Failed to establish encrypted audio channel with LiveKit SFU.');
        setAppState('ended');
      }
    },
    [connectLiveKit, disconnectLiveKit]
  );

  // Telegram WebApp Initialization & Auth Verification
  const initAuth = useCallback(async () => {
    logger.info('BOOT', 'APP_BOOT: Initializing authentication check');

    const tgPresent = Boolean(window.Telegram);
    const webAppPresent = Boolean(window.Telegram?.WebApp);

    logger.info('TELEGRAM', `TELEGRAM_SDK_PRESENT: ${tgPresent}`);
    logger.info('TELEGRAM', `TELEGRAM_WEBAPP_PRESENT: ${webAppPresent}`);

    const getRawInitData = (): string => {
      const tg = window.Telegram?.WebApp;
      if (tg?.initData && tg.initData.trim() !== '') {
        return tg.initData;
      }

      const hashMatch = window.location.hash.match(/[#&]tgWebAppData=([^&]+)/);
      if (hashMatch) return hashMatch[1];

      const searchMatch = window.location.search.match(/[?&]tgWebAppData=([^&]+)/);
      if (searchMatch) return searchMatch[1];

      const initDataMatch = window.location.search.match(/[?&]initData=([^&]+)/);
      if (initDataMatch) return initDataMatch[1];

      return '';
    };

    let rawInitData = getRawInitData();

    // Poll up to 1000ms (10 x 100ms) to allow Telegram WebApp SDK script to finish initializing
    if (!rawInitData) {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        rawInitData = getRawInitData();
        if (rawInitData) break;
      }
    }

    if (!rawInitData || rawInitData.trim() === '') {
      logger.warn('TELEGRAM', 'TELEGRAM_INIT_DATA_MISSING');
      const isTelegramWebview = webAppPresent || /Telegram/i.test(navigator.userAgent);
      const reason: LockdownReason = isTelegramWebview ? 'telegram_no_initdata' : 'browser_direct';
      setLockdownReason(reason);
      setErrorMessage(
        isTelegramWebview
          ? 'You are opening this page inside Telegram, but not as a Telegram Mini App. Please launch using the Bot Menu Button or WebApp button in Telegram.'
          : 'This application can only be launched inside Telegram as a Mini App. Direct web browser access is restricted.'
      );
      logger.warn('STATE', `APP_LOCKDOWN: ${reason}`);
      setAppState('lockdown');
      return;
    }

    logger.info('TELEGRAM', 'TELEGRAM_INIT_DATA_PRESENT');
    setInitData(rawInitData);

    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    // Verify initData with server to get DB user profile (UUID)
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || '';
      logger.info('AUTH', `AUTH_REQUEST_STARTED: Calling /api/auth/verify`);

      const res = await fetch(`${serverUrl}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': rawInitData,
        },
        body: JSON.stringify({ initData: rawInitData }),
      });

      logger.info('AUTH', `AUTH_RESPONSE_RECEIVED: HTTP ${res.status}`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          logger.error('AUTH', 'AUTH_REJECTED: Server rejected initData signature');
          setLockdownReason('auth_rejected');
        } else {
          logger.error('AUTH', `AUTH_FAILED: Server returned HTTP ${res.status}`);
          setLockdownReason('server_unavailable');
        }
        setErrorMessage(errData.error || 'Authentication failed. Please start the Telegram Bot first.');
        logger.warn('STATE', 'APP_LOCKDOWN: Auth failed');
        setAppState('lockdown');
        return;
      }

      const data = await res.json();
      if (data.success && data.user) {
        logger.info('AUTH', 'AUTH_SUCCESS: Profile verified');
        setUserData({
          userId: data.user.id, // Verified DB UUID
          band: data.user.band || 6.5,
          weakSkill: data.user.weakSkill || 'P',
          strongSkill: data.user.strongSkill || 'FC',
        });

        // Check if there is an active call session (e.g. direct call accepted or reconnect)
        try {
          const activeRes = await fetch(`${serverUrl}/api/calls/active`, {
            headers: { 'x-telegram-init-data': rawInitData },
          });
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            if (activeData.hasActiveCall) {
              handleMatchFound({
                roomName: activeData.roomName,
                livekitToken: activeData.livekitToken,
                partnerAlias: activeData.partnerAlias,
                partnerBand: activeData.partnerBand,
                callDurationLimit: activeData.callDurationLimit,
              });
              return;
            }
          }
        } catch (activeErr) {
          console.warn('Active call check warning:', activeErr);
        }

        setAppState('ready');
      } else {
        logger.warn('AUTH', 'AUTH_FAILED: User profile not found');
        setErrorMessage('User profile not found. Please complete /start in Telegram Bot.');
        setLockdownReason('auth_rejected');
        setAppState('lockdown');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('AUTH', `AUTH_NETWORK_ERROR: ${errorMsg}`);
      setLockdownReason('server_unavailable');
      setErrorMessage('Network error connecting to backend server.');
      setAppState('lockdown');
    }
  }, [handleMatchFound]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const handleCallEnded = useCallback(() => {
    disconnectLiveKit();
    setAppState('ended');
  }, [disconnectLiveKit]);

  // Socket Connection & Event Listeners
  useEffect(() => {
    if (!initData || !userData.userId || appState === 'lockdown' || appState === 'ready' || appState === 'idle') {
      hasJoinedQueueRef.current = false;
      return;
    }

    const socket = socketService.connect(initData);

    socket.on('match_found', handleMatchFound);
    socket.on('call_finished', handleCallEnded);

    // Auto-join queue when in radar state
    if (appState === 'radar') {
      if (!hasJoinedQueueRef.current) {
        socketService.joinQueue(userData);
        hasJoinedQueueRef.current = true;
      }
    } else {
      hasJoinedQueueRef.current = false;
    }

    return () => {
      socket.off('match_found', handleMatchFound);
      socket.off('call_finished', handleCallEnded);
    };
  }, [initData, appState, userData, handleMatchFound, handleCallEnded]);

  const handleCancelMatchmaking = () => {
    if (userData.userId) {
      socketService.cancelQueue(userData.userId);
    }
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

  // Handler for the "Start Searching" button — captures user gesture for autoplay policy
  const handleStartSearching = () => {
    setAppState('radar');
  };

  if (appState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (appState === 'lockdown') {
    return <LockdownScreen reason={lockdownReason} message={errorMessage} onRetry={initAuth} />;
  }

  if (appState === 'ready') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-indigo-500/10 border-2 border-indigo-500/40 flex items-center justify-center mb-6 shadow-lg shadow-indigo-500/20">
          <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 mb-2">Ready to Practice?</h1>
        <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">
          Tap the button below to start searching for an IELTS speaking practice partner.
        </p>
        <button
          onClick={handleStartSearching}
          className="py-3.5 px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30 text-lg"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Start Searching
        </button>
      </div>
    );
  }

  if (appState === 'radar') {
    return (
      <RadarScreen
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

  const isCancelled = !errorMessage && !matchData;

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
        {errorMessage ? 'Call Connection Issue' : isCancelled ? 'Search Cancelled' : 'Call Session Ended'}
      </h1>
      <p className="text-sm text-slate-400 max-w-xs mb-8 leading-relaxed">
        {errorMessage || (isCancelled 
          ? 'You have cancelled the matchmaking search. Tap the button below when you are ready to try again.'
          : 'Thank you for practicing! Check your Telegram chat for post-call partner evaluation and recording access.')}
      </p>

      <button
        onClick={handleRestart}
        className="py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
      >
        <RefreshCw className="w-5 h-5" />
        <span>{isCancelled ? 'Try Again' : 'Find Next Partner'}</span>
      </button>
    </div>
  );
};

export default App;
