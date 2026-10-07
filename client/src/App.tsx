import React, { useEffect, useState, useCallback, useRef } from 'react';
import type { AppState, MatchFoundPayload, UserMatchData, LockdownReason } from './types';
import { socketService } from './services/socket';
import { useLiveKit } from './hooks/useLiveKit';
import { LockdownScreen } from './components/LockdownScreen';
import { RadarScreen } from './components/RadarScreen';
import { ActiveCallScreen } from './components/ActiveCallScreen';
import { PrivacyScreen } from './components/PrivacyScreen';
import { GuidelinesScreen } from './components/GuidelinesScreen';
import { Dashboard } from './components/Dashboard';
import { redirectToLanding } from './services/dashboard';
import { logger } from './services/logger';
import { ReadyScreen } from './components/ReadyScreen';
import { SessionStatusScreen } from './components/SessionStatusScreen';

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
  const [appState, setAppStateValue] = useState<AppState>('idle');
  const appStateRef = useRef<AppState>('idle');
  const setAppState = useCallback((state: AppState) => {
    appStateRef.current = state;
    setAppStateValue(state);
  }, []);
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
  const [pendingDirectCall, setPendingDirectCall] = useState<MatchFoundPayload | null>(null);
  const [synchronizedStartedAt, setSynchronizedStartedAt] = useState<number | null>(null);

  // 3. Refs (unconditional)
  const hasJoinedQueueRef = useRef(false);
  const matchAttemptRef = useRef(0);
  const authAttemptRef = useRef(0);
  const authControllerRef = useRef<AbortController | null>(null);

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
    getRoom,
    isPartnerConnected,
    error: voiceError,
  } = useLiveKit();

  // 5. Match Found Callback (unconditional)
  const handleMatchFound = useCallback(
    async (data: MatchFoundPayload, isReconnection = false) => {
      if (!isReconnection && (appStateRef.current === 'ended' || appStateRef.current === 'idle')) {
        console.warn(`Ignoring late match_found event because app state is ${appStateRef.current}`);
        return;
      }

      const attempt = ++matchAttemptRef.current;

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
        if (attempt !== matchAttemptRef.current) return;

        const currentState = appStateRef.current as AppState;
        if (currentState === 'ended' || currentState === 'idle') {
          disconnectLiveKit();
          return;
        }

        setAppState('in_call');
        socketService.peerReady(data.roomName);
      } catch (err) {
        if (attempt !== matchAttemptRef.current || (err instanceof Error && err.name === 'AbortError')) return;
        console.error('Failed to establish audio connection:', err);
        setErrorMessage('Unable to establish voice connection. Please try again.');
        setAppState('ended');
      }
    },
    [connectLiveKit, disconnectLiveKit, setAppState]
  );

  // 6. Telegram WebApp Initialization & Deterministic Access-Control Verification (unconditional)
  const initAuth = useCallback(async () => {
    const attempt = ++authAttemptRef.current;
    authControllerRef.current?.abort();
    const controller = new AbortController();
    authControllerRef.current = controller;
    logger.info('BOOT', 'APP_BOOT: Initializing deterministic access control check');

    const tgPresent = Boolean(window.Telegram);
    const webAppPresent = Boolean(window.Telegram?.WebApp);

    logger.info('TELEGRAM', `TELEGRAM_SDK_PRESENT: ${tgPresent}`);
    logger.info('TELEGRAM', `TELEGRAM_WEBAPP_PRESENT: ${webAppPresent}`);

    const getRawInitData = (): string => {
      const tg = window.Telegram?.WebApp;
      if (!tg || tg.platform === 'unknown') return '';
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

      return '';
    };

    let rawInitData = getRawInitData();

    // Poll up to 1000ms (10 x 100ms) to allow Telegram WebApp SDK script to finish initializing
    if (!rawInitData) {
      for (let pollIndex = 0; pollIndex < 10; pollIndex++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (attempt !== authAttemptRef.current || controller.signal.aborted) return;
        rawInitData = getRawInitData();
        if (rawInitData) break;
      }
    }

    // Gate 1: Non-Telegram or Missing InitData Check
    if (!rawInitData || rawInitData.trim() === '') {
      logger.warn('TELEGRAM', 'TELEGRAM_INIT_DATA_MISSING');
      const webApp = window.Telegram?.WebApp;
      const isTelegramWebview = Boolean(webApp && webApp.platform !== 'unknown');
      const reason: LockdownReason = isTelegramWebview ? 'telegram_no_initdata' : 'browser_direct';
      setLockdownReason(reason);
      setErrorMessage(
        isTelegramWebview
          ? 'You are opening this page inside Telegram, but not as a Telegram Mini App. Please launch using the Bot Menu Button.'
          : 'This application operates exclusively within Telegram as an authenticated Mini App. External browser access is restricted.'
      );
      logger.warn('STATE', `APP_LOCKDOWN: ${reason}`);
      setAppState('lockdown');
      if (!isTelegramWebview) redirectToLanding();
      return;
    }

    logger.info('TELEGRAM', 'TELEGRAM_INIT_DATA_PRESENT');
    setInitData(rawInitData);

    const tg = window.Telegram?.WebApp;
    if (tg) {
      try { tg.ready(); tg.expand(); }
      catch { logger.warn('TELEGRAM', 'Telegram window expansion is unavailable.'); }
    }

    // Gate 2-5: Verify initData with server to evaluate rate-limits, account moderation, and quota
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    const ensureCurrent = () => {
      if (attempt !== authAttemptRef.current || controller.signal.aborted) throw new DOMException('Authentication request cancelled.', 'AbortError');
    };
    try {
      const serverUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
      logger.info('AUTH', `AUTH_REQUEST_STARTED: Calling /api/auth/verify on ${serverUrl || 'same-origin'}`);

      const res = await fetch(`${serverUrl}/api/auth/verify`, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': rawInitData,
        },
        body: JSON.stringify({ initData: rawInitData }),
      });
      ensureCurrent();

      logger.info('AUTH', `AUTH_RESPONSE_RECEIVED: HTTP ${res.status}`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        ensureCurrent();
        const errorCode = typeof errData.code === 'string' ? errData.code.toUpperCase() : '';
        
        // Deterministic Error Gate Classification
        if (res.status === 429 || errorCode === 'RATE_LIMITED') {
          logger.warn('AUTH', 'RATE_LIMITED: Client rate limit threshold reached');
          setLockdownReason('rate_limited');
          setLockdownRetrySeconds(errData.retryAfterSeconds || 30);
          setErrorMessage(errData.message || 'Request threshold exceeded. System cooldown engaged.');
        } else if (errorCode === 'BANNED' || errData.isPermanentlyBanned) {
          logger.error('AUTH', 'BANNED: Permanent account lock');
          setLockdownReason('banned');
          setErrorMessage(errData.error || errData.message || 'Your account has been permanently restricted due to guideline violations.');
        } else if (errorCode === 'SUSPENDED' || errData.bannedUntil) {
          logger.warn('AUTH', 'SUSPENDED: Temporary suspension active');
          setLockdownReason('suspended');
          setLockdownBannedUntil(errData.bannedUntil || null);
          setErrorMessage(errData.error || errData.message || 'Your account is suspended pending review.');
        } else if (errorCode === 'QUOTA_EXHAUSTED') {
          logger.warn('AUTH', 'QUOTA_EXHAUSTED: Monthly practice calls depleted');
          setLockdownReason('exhausted_quota');
          setErrorMessage(errData.message || 'You have exhausted your monthly call limit.');
        } else if (errorCode === 'REGISTRATION_REQUIRED' || errorCode === 'TERMS_REQUIRED') {
          setLockdownReason(errorCode === 'TERMS_REQUIRED' ? 'terms_required' : 'registration_required');
          setErrorMessage(errData.error || 'Complete registration in the Telegram bot.');
        } else if (res.status === 403 || errorCode === 'AUTH_REJECTED') {
          logger.error('AUTH', 'AUTH_REJECTED: Server rejected initData signature');
          setLockdownReason('auth_rejected');
          setErrorMessage(errData.error || errData.message || 'Authentication failed or session expired.');
          setInitData('');
          socketService.disconnect();
          redirectToLanding();
        } else {
          logger.error('AUTH', `AUTH_FAILED: Server returned HTTP ${res.status}`);
          setLockdownReason('server_unavailable');
          setErrorMessage(errData.error || errData.message || 'Unable to establish secure telemetry with backend cluster.');
        }

        setAppState('lockdown');
        return;
      }

      const data = await res.json();
      ensureCurrent();
      if (data.success && data.user) {
        logger.info('AUTH', 'AUTH_SUCCESS: Profile verified');

        // Check if user has depleted calls quota

        // Preserve authentic IELTS half-band scores (Math.round(band * 2) / 2)
        const toHalfBand = (score: number) => Math.max(5, Math.min(9, Math.round(score * 2) / 2));
        const authenticBand = toHalfBand(data.user.band || 7);
        setUserData({
          userId: data.user.id,
          telegramId: data.user.telegramId,
          alias: data.user.alias,
          band: authenticBand,
          subFC: data.user.subFC ? toHalfBand(data.user.subFC) : authenticBand,
          subLR: data.user.subLR ? toHalfBand(data.user.subLR) : authenticBand,
          subGRA: data.user.subGRA ? toHalfBand(data.user.subGRA) : authenticBand,
          subP: data.user.subP ? toHalfBand(data.user.subP) : authenticBand,
          weakSkill: data.user.weakSkill || 'P',
          strongSkill: data.user.strongSkill || 'FC',
          plan: data.user.plan || 'FREE',
          planExpiresAt: data.user.planExpiresAt || null,
          callsRemaining: data.user.callsRemaining ?? 0,
          totalCallsLimit: data.user.totalCallsLimit,
          maxCallDuration: data.user.maxCallDuration,
          recordingsRemaining: data.user.recordingsRemaining,
          recordingsLimit: data.user.recordingsLimit,
          recordingRetentionDays: data.user.recordingRetentionDays,
          dnd: data.user.dnd ?? false,
        });

        // Check if there is an active call session (e.g. direct call accepted or reconnect)
        try {
          const currentParams = new URLSearchParams(window.location.search);
          const activeParams = new URLSearchParams();
          for (const key of ['active_call', 'sessionId']) {
            const value = currentParams.get(key);
            if (value) activeParams.set(key, value);
          }
          const activeUrl = `${serverUrl}/api/calls/active${activeParams.size ? '?' + activeParams.toString() : ''}`;
          const activeRes = await fetch(activeUrl, {
            signal: controller.signal,
            headers: { 'x-telegram-init-data': rawInitData },
          });
          ensureCurrent();
          if (activeRes.ok) {
            const activeData = await activeRes.json();
            ensureCurrent();
            if (activeData.hasActiveCall) {
              setPendingDirectCall({
                roomName: activeData.roomName,
                livekitToken: activeData.livekitToken,
                livekitUrl: activeData.livekitUrl,
                partnerAlias: activeData.partnerAlias,
                partnerBand: activeData.partnerBand,
                callDurationLimit: activeData.callDurationLimit,
              });
              setAppState('ready');
              return;
            }
          }
        } catch (activeErr) {
          ensureCurrent();
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
      if (attempt !== authAttemptRef.current || (controller.signal.aborted && !timedOut)) return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('AUTH', `AUTH_NETWORK_ERROR: ${errorMsg}`);
      setLockdownReason('server_unavailable');
      setErrorMessage(timedOut ? 'The server took too long to respond. Please try again.' : 'Network error connecting to backend server cluster.');
      setAppState('lockdown');
    } finally {
      clearTimeout(timeout);
    }
  }, [setAppState]);

  // 7. Trigger Init Auth on Mount (unconditional)
  const cancelAuth = useCallback(() => {
    authAttemptRef.current++;
    authControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    void initAuth();
    return () => {
      cancelAuth();
      socketService.disconnect();
    };
  }, [initAuth, cancelAuth]);

  // 8. Call Ended Handler (unconditional)
  const handleCallEnded = useCallback(() => {
    matchAttemptRef.current++;
    disconnectLiveKit();
    setSynchronizedStartedAt(null);
    setAppState('ended');
  }, [disconnectLiveKit, setAppState]);

  useEffect(() => {
    if (!voiceError || appStateRef.current !== 'in_call') return;
    if (matchData) socketService.finishCall(matchData.roomName, userData.userId, 'voice_disconnected');
    setErrorMessage(voiceError);
    handleCallEnded();
  }, [voiceError, matchData, userData.userId, handleCallEnded]);

  // 9. Socket Connection & Event Listeners (unconditional)
  useEffect(() => {
    if (!initData || !userData.userId || appState === 'lockdown') {
      hasJoinedQueueRef.current = false;
      return;
    }

    const socket = socketService.connect(initData);

    const onMatch = (data: MatchFoundPayload) => handleMatchFound(data, false);
    const onCallStarted = (data: { startedAt: number; durationSeconds: number; expiresAt: number }) => {
      setSynchronizedStartedAt(data.startedAt);
    };
    const onSocketError = (err: { code?: string; message?: string } | string) => {
      const code = typeof err === 'object' && err !== null ? err.code : undefined;
      const msg = typeof err === 'string' ? err : err?.message || 'Matchmaking error occurred.';

      const nonFatalCodes = [
        'RECORDING_UNAVAILABLE',
        'RECORDING_START_FAILED',
        'RECORDING_STOP_FAILED',
        'PAYMENT_RATE_LIMITED',
        'ALREADY_IN_PROGRESS',
        'CALL_ALREADY_ACTIVE',
      ];

      // If user is currently in a call and gets a recording/non-fatal error, do NOT end the call
      if (appStateRef.current === 'in_call' && code && nonFatalCodes.includes(code)) {
        console.warn('[Call] Non-fatal notification during active call:', msg);
        return;
      }

      setErrorMessage(msg);
      handleCallEnded();
    };

    const onConnectError = () => {
      if (appStateRef.current !== 'radar') return;
      socketService.cancelQueue(userData.userId);
      setErrorMessage('Unable to connect to matchmaking. Check your connection and try again.');
      handleCallEnded();
    };
    const onReconnectFailed = () => {
      const state = appStateRef.current;
      if (state !== 'radar' && state !== 'connecting' && state !== 'in_call') return;
      if (state === 'radar') socketService.cancelQueue(userData.userId);
      setErrorMessage('The connection to the call server was lost. Check your connection and try again.');
      handleCallEnded();
    };

    socket.on('match_found', onMatch);
    socket.on('call_started', onCallStarted);
    socket.on('call_finished', handleCallEnded);
    socket.on('error', onSocketError);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_failed', onReconnectFailed);

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
      socket.off('call_started', onCallStarted);
      socket.off('call_finished', handleCallEnded);
      socket.off('error', onSocketError);
      socket.off('connect_error', onConnectError);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.off('connect', handleRejoin);
    };
  }, [initData, appState, userData, handleMatchFound, handleCallEnded, setAppState]);

  // Action handlers
  const handleCancelMatchmaking = () => {
    matchAttemptRef.current++;
    if (userData.userId) {
      socketService.cancelQueue(userData.userId);
    }
    setSynchronizedStartedAt(null);
    setAppState('ended');
  };

  const handleFinishCall = (reason?: string) => {
    if (appStateRef.current !== 'in_call' && appStateRef.current !== 'connecting') return;
    matchAttemptRef.current++;
    if (matchData) {
      socketService.finishCall(matchData.roomName, userData.userId, reason);
    }
    disconnectLiveKit();
    setSynchronizedStartedAt(null);
    if (reason === 'microphone_permission_denied') {
      setErrorMessage('Microphone access was denied 3 times. Speaking practice requires microphone access.');
    }
    setAppState('ended');
  };

  const handleJoinDirectCall = useCallback(async () => {
    if (!pendingDirectCall) return;
    const directCall = pendingDirectCall;
    setPendingDirectCall(null);
    try {
      await startAudio();
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        // Prime audio permissions during the user gesture event tick
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
    } catch (e) {
      console.warn('[DirectCall] startAudio / mic unlock warning:', e);
    }
    await handleMatchFound(directCall, true);
    try {
      await retryMicrophone();
      const currentRoom = getRoom();
      if (currentRoom?.localParticipant) {
        await currentRoom.localParticipant.setMicrophoneEnabled(true);
      }
    } catch (e) {
      console.warn('[DirectCall] Mic activation fallback:', e);
    }
  }, [pendingDirectCall, startAudio, handleMatchFound, retryMicrophone, getRoom]);

  const handleRestart = () => {
    startAudio().catch(() => {});
    setPendingDirectCall(null);
    setMatchData(null);
    setErrorMessage(null);
    setAppState('radar');
  };

  const handleStartSearching = () => {
    startAudio().catch(() => {});
    setPendingDirectCall(null);
    setAppState('radar');
  };

  // =========================================================================
  // VIEW ROUTING DISPATCHER (Clean JSX returns AFTER all hooks executed)
  // =========================================================================

  if (activeView === 'privacy' && appState === 'ready') {
    return (
      <PrivacyScreen
        onBack={() => {
          window.location.hash = '';
          setActiveView('main');
        }}
      />
    );
  }

  if (activeView === 'guidelines' && appState === 'ready') {
    return (
      <GuidelinesScreen
        onBack={() => {
          window.location.hash = '';
          setActiveView('main');
        }}
      />
    );
  }

  if (appState === 'idle') return <SessionStatusScreen state="loading" />;

  // 2. Deterministic Access-Control Lockdown Screen / Public Landing Page
  if (appState === 'lockdown') {
    if (lockdownReason === 'browser_direct') {
      return null;
    }

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

  if (appState === 'ready') {
    return (
      <Dashboard initData={initData} userData={userData} onProfileUpdated={setUserData} onAccessLost={initAuth} onOpenActiveCall={initAuth} renderPractice={navigation => <ReadyScreen
        navigation={navigation}
        userData={userData}
        onStart={
          pendingDirectCall ? handleJoinDirectCall : handleStartSearching
        }
        onGuidelines={() => setActiveView('guidelines')}
        onPrivacy={() => setActiveView('privacy')}
        directPartner={
          pendingDirectCall
            ? {
                alias: pendingDirectCall.partnerAlias || 'Partner',
                band: pendingDirectCall.partnerBand,
              }
            : undefined
        }
        onDismissDirect={() => setPendingDirectCall(null)}
      />} />
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

  if (appState === 'connecting')
    return <SessionStatusScreen state="connecting" />;

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
        isPartnerConnected={isPartnerConnected}
        synchronizedStartedAt={synchronizedStartedAt}
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

  const isCancelled = !errorMessage && !matchData;
  return (
    <SessionStatusScreen
      state="ended"
      onDashboard={() => {
        const url = new URL(window.location.href);
        url.searchParams.set('view', 'history');
        window.history.replaceState(null, '', url);
        void initAuth();
      }}
      error={errorMessage}
      cancelled={isCancelled}
      onRestart={handleRestart}
    />
  );
};

export default App;
