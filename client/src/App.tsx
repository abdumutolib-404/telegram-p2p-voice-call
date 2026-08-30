import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { AppState, MatchFoundPayload, UserMatchData, LockdownReason } from './types';
import { socketService } from './services/socket';
import { useLiveKit } from './hooks/useLiveKit';
import { LockdownScreen } from './components/LockdownScreen';
import { RadarScreen } from './components/RadarScreen';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { PrivacyScreen } from './components/PrivacyScreen';
import { GuidelinesScreen } from './components/GuidelinesScreen';
import { logger } from './services/logger';
import {
  Loader2,
  PhoneOff,
  RefreshCw,
  AlertTriangle,
  Radio,
  ShieldCheck,
  BookOpen,
  Shield,
  PhoneCall,
} from 'lucide-react';

type ActiveView = 'main' | 'privacy' | 'guidelines';

export const App: React.FC = () => {
  // 1. Navigation State (unconditional)
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window === 'undefined') return 'main';
    const path = (window.location.pathname + window.location.hash).toLowerCase();
    if (path.includes('privacy')) return 'privacy';
    if (path.includes('guidelines')) return 'guidelines';
    return 'main';
  });

  // 2. Application Core State Machine (unconditional)
  const [appState, setAppState] = useState<AppState>('idle');
  const [lockdownReason, setLockdownReason] = useState<LockdownReason>('browser_direct');
  const [lockdownBannedUntil, setLockdownBannedUntil] = useState<string | null>(null);
  const [lockdownRetrySeconds, setLockdownRetrySeconds] = useState<number>(30);
  const [initData, setInitData] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Whole band defaults (5, 6, 7, 8, 9) - strictly whole-band
  const [userData, setUserData] = useState<UserMatchData>({
    userId: '',
    band: 7,
    subFC: 7,
    subLR: 7,
    subGRA: 7,
    subP: 7,
    weakSkill: 'P',
    strongSkill: 'FC',
    plan: 'FREE',
    callsRemaining: 3,
    totalCallsLimit: 3,
  });

  const [matchData, setMatchData] = useState<MatchFoundPayload | null>(null);

  // 3. Refs (unconditional)
  const appStateRef = useRef<AppState>(appState);
  const hasJoinedQueueRef = useRef(false);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  // Sync hash routing for guidelines and privacy views
  useEffect(() => {
    const handleHashChange = () => {
      const path = (window.location.pathname + window.location.hash).toLowerCase();
      if (path.includes('privacy')) {
        setActiveView('privacy');
      } else if (path.includes('guidelines')) {
        setActiveView('guidelines');
      } else {
        setActiveView('main');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  // 4. LiveKit SFU Audio Hook (unconditional)
  const {
    connect: connectLiveKit,
    disconnect: disconnectLiveKit,
    isMicMuted,
    canPlaybackAudio,
    micError,
    micDeniedCount,
    toggleMic,
    retryMicrophone,
    startAudio,
    analyserNode,
  } = useLiveKit();

  // 5. Match Found Callback (unconditional)
  const handleMatchFound = useCallback(
    async (data: MatchFoundPayload, isReconnection = false) => {
      if (!isReconnection && (appStateRef.current === 'ended' || appStateRef.current === 'idle')) {
        console.warn(`Ignoring late match_found event because app state is ${appStateRef.current}`);
        return;
      }

      const livekitToken = data.livekitToken || data.token || '';
      const callDurationLimit = data.callDurationLimit ?? data.maxDurationSeconds ?? 900;

      const normalizedData: MatchFoundPayload = {
        ...data,
        livekitToken,
        callDurationLimit,
      };

      setMatchData(normalizedData);
      setAppState('connecting');

      const livekitUrl =
        data.livekitUrl || import.meta.env.VITE_LIVEKIT_URL || 'wss://pairtalk-d4a5d9pm.livekit.cloud';

      try {
        await connectLiveKit(livekitUrl, livekitToken);

        const currentState = appStateRef.current as AppState;
        if (currentState === 'ended' || currentState === 'idle') {
          disconnectLiveKit();
          return;
        }

        setAppState('in_call');
      } catch (err) {
        console.error('Failed to establish audio connection:', err);
        setErrorMessage('Unable to establish voice connection. Please try again.');
        setAppState('ended');
      }
    },
    [connectLiveKit, disconnectLiveKit]
  );

  // 6. Telegram WebApp Initialization & Deterministic Access-Control Verification (unconditional)
  const initAuth = useCallback(async () => {
    logger.info('BOOT', 'APP_BOOT: Initializing deterministic access control check');

    const tgPresent = Boolean(window.Telegram);
    const webAppPresent = Boolean(window.Telegram?.WebApp);

    logger.info('TELEGRAM', `TELEGRAM_SDK_PRESENT: ${tgPresent}`);
    logger.info('TELEGRAM', `TELEGRAM_WEBAPP_PRESENT: ${webAppPresent}`);

    const getRawInitData = (): string => {
      const tg = window.Telegram?.WebApp;
      if (tg?.initData && tg.initData.trim() !== '') {
        return tg.initData;
      }

      const safeDecode = (val: string): string => {
        try {
          return decodeURIComponent(val);
        } catch {
          return val;
        }
      };

      const hashMatch = window.location.hash.match(/[#&]tgWebAppData=([^&]+)/);
      if (hashMatch) return safeDecode(hashMatch[1]);

      const searchMatch = window.location.search.match(/[?&]tgWebAppData=([^&]+)/);
      if (searchMatch) return safeDecode(searchMatch[1]);

      const initDataMatch = window.location.search.match(/[?&]initData=([^&]+)/);
      if (initDataMatch) return safeDecode(initDataMatch[1]);

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

    // Gate 1: Non-Telegram or Missing InitData Check
    if (!rawInitData || rawInitData.trim() === '') {
      logger.warn('TELEGRAM', 'TELEGRAM_INIT_DATA_MISSING');
      const isTelegramWebview = webAppPresent || /Telegram/i.test(navigator.userAgent);
      const reason: LockdownReason = isTelegramWebview ? 'telegram_no_initdata' : 'browser_direct';
      setLockdownReason(reason);
      setErrorMessage(
        isTelegramWebview
          ? 'You are opening this page inside Telegram, but not as a Telegram Mini App. Please launch using the Bot Menu Button.'
          : 'This application operates exclusively within Telegram as an authenticated Mini App. External browser access is restricted.'
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

    // Gate 2-5: Verify initData with server to evaluate rate-limits, account moderation, and quota
    try {
      const serverUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
      logger.info('AUTH', `AUTH_REQUEST_STARTED: Calling /api/auth/verify on ${serverUrl || 'same-origin'}`);

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
        
        // Deterministic Error Gate Classification
        if (res.status === 429 || errData.code === 'RATE_LIMITED') {
          logger.warn('AUTH', 'RATE_LIMITED: Client rate limit threshold reached');
          setLockdownReason('rate_limited');
          setLockdownRetrySeconds(errData.retryAfterSeconds || 30);
          setErrorMessage(errData.message || 'Request threshold exceeded. System cooldown engaged.');
        } else if (errData.code === 'BANNED' || errData.isPermanentlyBanned) {
          logger.error('AUTH', 'BANNED: Permanent account lock');
          setLockdownReason('banned');
          setErrorMessage(errData.message || 'Your account has been permanently restricted due to guideline violations.');
        } else if (errData.code === 'SUSPENDED' || errData.bannedUntil) {
          logger.warn('AUTH', 'SUSPENDED: Temporary suspension active');
          setLockdownReason('suspended');
          setLockdownBannedUntil(errData.bannedUntil || null);
          setErrorMessage(errData.message || 'Your account is under temporary moderation suspension.');
        } else if (errData.code === 'QUOTA_EXHAUSTED') {
          logger.warn('AUTH', 'QUOTA_EXHAUSTED: Monthly practice calls depleted');
          setLockdownReason('exhausted_quota');
          setErrorMessage(errData.message || 'You have exhausted your monthly call limit.');
        } else if (res.status === 403 || errData.code === 'AUTH_REJECTED') {
          logger.error('AUTH', 'AUTH_REJECTED: Server rejected initData signature');
          setLockdownReason('auth_rejected');
          setErrorMessage(errData.error || errData.message || 'Authentication failed or session expired.');
        } else {
          logger.error('AUTH', `AUTH_FAILED: Server returned HTTP ${res.status}`);
          setLockdownReason('server_unavailable');
          setErrorMessage(errData.error || errData.message || 'Unable to establish secure telemetry with backend cluster.');
        }

        setAppState('lockdown');
        return;
      }

      const data = await res.json();
      if (data.success && data.user) {
        logger.info('AUTH', 'AUTH_SUCCESS: Profile verified');

        // Check if user has depleted calls quota
        const callsRem = data.user.callsRemaining ?? 3;
        if (callsRem <= 0 && data.user.plan === 'FREE') {
          setLockdownReason('exhausted_quota');
          setErrorMessage('You have exhausted your free monthly practice quota. Upgrade to PLUS, PRO, or BOSS to continue.');
          setAppState('lockdown');
          return;
        }

        // Set verified user state using whole-band defaults (5, 6, 7, 8, 9)
        const wholeBand = Math.max(5, Math.min(9, Math.round(data.user.band || 7)));
        setUserData({
          userId: data.user.id,
          telegramId: data.user.telegramId,
          alias: data.user.alias,
          band: wholeBand,
          subFC: data.user.subFC ? Math.round(data.user.subFC) : wholeBand,
          subLR: data.user.subLR ? Math.round(data.user.subLR) : wholeBand,
          subGRA: data.user.subGRA ? Math.round(data.user.subGRA) : wholeBand,
          subP: data.user.subP ? Math.round(data.user.subP) : wholeBand,
          weakSkill: data.user.weakSkill || 'P',
          strongSkill: data.user.strongSkill || 'FC',
          plan: data.user.plan || 'FREE',
          planExpiresAt: data.user.planExpiresAt || null,
          callsRemaining: data.user.callsRemaining ?? 3,
          totalCallsLimit: data.user.totalCallsLimit ?? (data.user.plan === 'BOSS' ? 50 : data.user.plan === 'PRO' ? 25 : data.user.plan === 'PLUS' ? 10 : 3),
          maxCallDuration: data.user.maxCallDuration ?? (data.user.plan === 'BOSS' ? 90 : data.user.plan === 'PRO' ? 60 : data.user.plan === 'PLUS' ? 30 : 15),
          recordingsRemaining: data.user.recordingsRemaining ?? 1,
          recordingsLimit: data.user.recordingsLimit ?? (data.user.plan === 'BOSS' ? 15 : data.user.plan === 'PRO' ? 7 : data.user.plan === 'PLUS' ? 3 : 1),
          recordingRetentionDays: data.user.recordingRetentionDays ?? (data.user.plan === 'BOSS' ? 90 : data.user.plan === 'PRO' ? 30 : data.user.plan === 'PLUS' ? 7 : 1),
          dnd: data.user.dnd ?? false,
        });

        // Check if there is an active call session (e.g. direct call accepted or reconnect)
        try {
          const activeRes = await fetch(`${serverUrl}/api/calls/active`, {
            headers: { 'x-telegram-init-data': rawInitData },
          });
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            if (activeData.hasActiveCall) {
              handleMatchFound(
                {
                  roomName: activeData.roomName,
                  livekitToken: activeData.livekitToken,
                  partnerAlias: activeData.partnerAlias,
                  partnerBand: activeData.partnerBand,
                  callDurationLimit: activeData.callDurationLimit,
                },
                true
              );
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
      setErrorMessage('Network error connecting to backend server cluster.');
      setAppState('lockdown');
    }
  }, [handleMatchFound]);

  // 7. Trigger Init Auth on Mount (unconditional)
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // 8. Call Ended Handler (unconditional)
  const handleCallEnded = useCallback(() => {
    disconnectLiveKit();
    setAppState('ended');
  }, [disconnectLiveKit]);

  // 9. Socket Connection & Event Listeners (unconditional)
  useEffect(() => {
    if (!initData || !userData.userId || appState === 'lockdown') {
      hasJoinedQueueRef.current = false;
      return;
    }

    const socket = socketService.connect(initData);

    const onMatch = (data: MatchFoundPayload) => handleMatchFound(data, false);
    const onSocketError = (err: { code?: string; message?: string } | string) => {
      const code = typeof err === 'object' && err !== null ? err.code : undefined;
      const msg = typeof err === 'string' ? err : err?.message || 'Matchmaking error occurred.';

      const nonFatalCodes = [
        'RECORDING_UNAVAILABLE',
        'RECORDING_START_FAILED',
        'RECORDING_STOP_FAILED',
        'PAYMENT_RATE_LIMITED',
        'ALREADY_IN_PROGRESS',
      ];

      // If user is currently in a call and gets a recording/non-fatal error, do NOT end the call
      if (appStateRef.current === 'in_call' && code && nonFatalCodes.includes(code)) {
        console.warn('[Call] Non-fatal notification during active call:', msg);
        return;
      }

      setErrorMessage(msg);
      setAppState('ended');
    };

    socket.on('match_found', onMatch);
    socket.on('call_finished', handleCallEnded);
    socket.on('error', onSocketError);

    // Auto-join queue when in radar state & handle reconnection
    const handleRejoin = () => {
      socketService.joinQueue(userData);
      hasJoinedQueueRef.current = true;
    };

    if (appState === 'radar') {
      if (!hasJoinedQueueRef.current || !socket.connected) {
        handleRejoin();
      }
      socket.on('connect', handleRejoin);
    } else {
      hasJoinedQueueRef.current = false;
    }

    return () => {
      socket.off('match_found', onMatch);
      socket.off('call_finished', handleCallEnded);
      socket.off('error', onSocketError);
      socket.off('connect', handleRejoin);
    };
  }, [initData, appState, userData, handleMatchFound, handleCallEnded]);

  // Action handlers
  const handleCancelMatchmaking = () => {
    if (userData.userId) {
      socketService.cancelQueue(userData.userId);
    }
    setAppState('ended');
  };

  const handleFinishCall = (reason?: string) => {
    if (matchData) {
      socketService.finishCall(matchData.roomName, userData.userId, reason);
    }
    disconnectLiveKit();
    if (reason === 'microphone_permission_denied') {
      setErrorMessage('Microphone access was denied 3 times. Speaking practice requires microphone access.');
    }
    setAppState('ended');
  };

  const handleRestart = () => {
    startAudio().catch(() => {});
    setMatchData(null);
    setErrorMessage(null);
    setAppState('radar');
  };

  const handleStartSearching = () => {
    startAudio().catch(() => {});
    setAppState('radar');
  };

  // =========================================================================
  // VIEW ROUTING DISPATCHER (Clean JSX returns AFTER all hooks executed)
  // =========================================================================

  if (activeView === 'privacy') {
    return <PrivacyScreen onBack={() => setActiveView('main')} />;
  }

  if (activeView === 'guidelines') {
    return <GuidelinesScreen onBack={() => setActiveView('main')} />;
  }

  // 1. Idle Booting Screen
  if (appState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#05070E] text-white p-6 font-sans">
        <div className="w-16 h-16 rounded-3xl bg-[#090D18] border border-slate-800 flex items-center justify-center mb-4 shadow-2xl">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin motion-reduce:animate-none" />
        </div>
        <div className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">
          INITIALIZING GATEWAY...
        </div>
      </div>
    );
  }

  // 2. Deterministic Access-Control Lockdown Screen
  if (appState === 'lockdown') {
    return (
      <LockdownScreen
        reason={lockdownReason}
        message={errorMessage}
        bannedUntil={lockdownBannedUntil}
        retryAfterSeconds={lockdownRetrySeconds}
        onRetry={initAuth}
      />
    );
  }

  // 3. Ready Screen (Clean Cyberpunk Matchmaking Launcher)
  if (appState === 'ready') {
    const alias = userData.alias || (userData.telegramId ? `P2P-${String(userData.telegramId).slice(-8).toUpperCase()}` : 'P2P-CANDIDATE');
    return (
      <div className="flex flex-col justify-between min-h-screen p-5 md:p-6 bg-[#05070E] text-slate-100 font-sans selection:bg-cyan-500">
        {/* Top Minimal Bar */}
        <div className="w-full max-w-md mx-auto flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md shadow-cyan-500/10">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-cyan-400">PAIRIAL P2P</div>
              <div className="text-xs font-mono font-bold text-white tracking-tight">{alias}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
            <span className="text-[10px] text-slate-500 uppercase">BAND</span>
            <span className="font-bold text-cyan-400">{(userData.band || 7).toFixed(1)}</span>
          </div>
        </div>

        {/* Center Hero Card */}
        <div className="w-full max-w-md mx-auto my-auto py-6 text-center">
          <div className="relative w-24 h-24 mx-auto mb-5 rounded-3xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-purple-600 p-0.5 shadow-2xl shadow-cyan-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-[#090D18] rounded-3xl flex items-center justify-center border border-cyan-500/30">
              <PhoneCall className="w-10 h-10 text-cyan-400" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase border border-cyan-500/40 text-cyan-400 bg-cyan-950/40 mb-3">
            <ShieldCheck className="w-3 h-3" />
            <span>IELTS SPEAKING RADAR</span>
          </div>

          <h1 className="text-2xl font-mono font-black tracking-tight text-white uppercase mb-2">
            READY TO PRACTICE?
          </h1>

          <p className="text-xs text-slate-400 max-w-xs mx-auto mb-8 leading-relaxed font-mono">
            Autonomous matchmaking pairs you with a fellow candidate at your target band for focused IELTS Speaking practice.
          </p>

          <button
            type="button"
            onClick={handleStartSearching}
            className="w-full py-4 px-8 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-slate-950 rounded-2xl font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2.5 transition-transform active:scale-95 shadow-xl shadow-cyan-500/25 cursor-pointer"
          >
            <Radio className="w-5 h-5 animate-pulse motion-reduce:animate-none" />
            <span>START SPEAKING PRACTICE</span>
          </button>
        </div>

        {/* Bottom Policy Links */}
        <div className="w-full max-w-md mx-auto pt-4 border-t border-slate-900 flex items-center justify-between text-[11px] font-mono text-slate-500">
          <button
            type="button"
            onClick={() => setActiveView('guidelines')}
            className="hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Guidelines</span>
          </button>

          <span>PAIRIAL V2.0</span>

          <button
            type="button"
            onClick={() => setActiveView('privacy')}
            className="hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Privacy & Refunds</span>
          </button>
        </div>
      </div>
    );
  }

  // 4. Searching Radar Screen
  if (appState === 'radar') {
    return (
      <RadarScreen
        userAlias={userData.alias}
        targetBand={userData.band}
        onCancel={handleCancelMatchmaking}
      />
    );
  }

  // 5. Connecting Call Screen
  if (appState === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#05070E] text-white p-6 font-sans">
        <div className="w-16 h-16 rounded-3xl bg-[#090D18] border border-cyan-500/40 flex items-center justify-center mb-4 shadow-xl shadow-cyan-500/20">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin motion-reduce:animate-none" />
        </div>
        <h2 className="text-lg font-mono font-bold text-white mb-1 uppercase">PARTNER MATCHED</h2>
        <p className="text-xs font-mono text-slate-400">Establishing encrypted SFU voice channel...</p>
      </div>
    );
  }

  // 6. Active Voice Call Screen
  if (appState === 'in_call' && matchData) {
    return (
      <ActiveCallScreen
        roomName={matchData.roomName}
        userId={userData.userId}
        partnerAlias={matchData.partnerAlias}
        partnerBand={matchData.partnerBand}
        callDurationLimit={matchData.callDurationLimit ?? 900}
        isMicMuted={isMicMuted}
        canPlaybackAudio={canPlaybackAudio}
        micError={micError}
        micDeniedCount={micDeniedCount}
        analyserNode={analyserNode}
        onToggleMic={toggleMic}
        onRetryMic={retryMicrophone}
        onFinishCall={handleFinishCall}
        onUnlockAudio={startAudio}
      />
    );
  }

  // 7. Ended / Cancelled Screen
  const isCancelled = !errorMessage && !matchData;

  return (
    <div className="flex flex-col justify-between min-h-screen p-6 bg-[#05070E] text-slate-100 font-sans selection:bg-cyan-500">
      <div className="w-full max-w-sm mx-auto my-auto flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-[#090D18] border border-slate-800 flex items-center justify-center mb-5 shadow-2xl">
          {errorMessage ? (
            <AlertTriangle className="w-10 h-10 text-amber-400" />
          ) : (
            <PhoneOff className="w-10 h-10 text-slate-400" />
          )}
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase border border-slate-800 text-slate-400 bg-slate-950 mb-3">
          <span>{errorMessage ? 'SESSION ALERT' : isCancelled ? 'SEARCH CANCELLED' : 'SESSION COMPLETE'}</span>
        </div>

        <h1 className="text-xl font-mono font-black tracking-tight text-white uppercase mb-2">
          {errorMessage ? 'CONNECTION ISSUE' : isCancelled ? 'SEARCH CANCELLED' : 'CALL CONCLUDED'}
        </h1>

        <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed font-mono">
          {errorMessage ||
            (isCancelled
              ? 'Matchmaking search was cancelled. Tap below when you are ready to begin searching again.'
              : 'Thank you for practicing! Check your Telegram chat for partner ratings and session recordings.')}
        </p>

        <button
          type="button"
          onClick={handleRestart}
          className="w-full py-3.5 px-6 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-mono text-xs font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-cyan-600/25 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{isCancelled ? 'Try Again' : 'Find Next Partner'}</span>
        </button>
      </div>

      <div className="w-full max-w-sm mx-auto pt-4 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
        <span>STATUS: IDLE</span>
        <span>PAIRIAL V2</span>
      </div>
    </div>
  );
};

export default App;
