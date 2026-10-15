import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock, Heart, History, Mic, Settings, Users, Trophy, Star, Check, AlertTriangle, Sparkles, Edit3, ArrowLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { CopyButton, PendingIcon } from './CopyLink';
import { DashboardDialog } from './DashboardDialog';
import { MotionPresence } from './MotionPresence';
import { HistoryMark } from './HistoryMark';
import { RecordingAction, type RecordingDeliveryStatus } from './RecordingAction';
import { DashboardMenu } from './DashboardMenu';
import { Brand } from './Brand';
import { AllowanceDetails } from './AllowanceDetails';
import { DiscountOffers } from './DiscountOffers';
import { DashboardError, dashboardRequest, publicSiteUrl } from '../services/dashboard';
import type { UserMatchData } from '../types';

const PlansModal = lazy(() => import('./PlansModal').then(module => ({ default: module.PlansModal })));

type View = 'practice' | 'history' | 'partners' | 'community' | 'leaderboard' | 'account' | 'upgrade';
interface Session { recordings?: {id:string;createdAt:string;expiresAt:string}[]; id: string; partnerAlias: string; partnerBand: number; status: string; duration: number; createdAt: string; rating: number | null; reported: boolean; saved?: boolean; recordingAvailable: boolean; recordingExpiresAt: string | null }
interface Partner { id: string; alias: string; band: number; available: boolean }
interface Invitation { id: string; status: string; incoming: boolean; partnerAlias: string; expiresAt: string }
interface Community { referralPayload: string; referrals: { totalInvited: number; qualifyingCompleted?: number; activeBonusCalls: number; rewards: { id: string; referredAlias: string; status: string; expiresAt: string | null }[] }; contest: { isActive: boolean; contest: { title: string; description: string | null } | null; leaderboard: { rank: number; alias: string; invitesCount: number }[] } }
interface Props { completedRoomName?: string; initData: string; userData: UserMatchData; onProfileUpdated: (data: UserMatchData) => void; onAccessLost: () => void; onOpenActiveCall: () => void; renderPractice: (navigation: ReactNode, shortcuts: ReactNode) => ReactNode }
const views: { id: View; label: string; icon: typeof Mic }[] = [
  { id: 'practice', label: 'Practice', icon: Mic }, { id: 'history', label: 'History & audio', icon: History }, { id: 'partners', label: 'Partners', icon: Heart }, { id: 'community', label: 'Invites', icon: Users }, { id: 'leaderboard', label: 'Hall of Fame', icon: Trophy }, { id: 'account', label: 'Account', icon: Settings }, { id: 'upgrade', label: 'Pay as you go', icon: Sparkles },
];
const reasons = ['Harassment', 'Hate speech', 'Explicit content', 'Spam or solicitation', 'Other unsafe behavior'];
const date = (value: string | null | undefined) => { const parsed = value ? new Date(value) : null; return !parsed || Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const expiry = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'Expiry unavailable' : `${parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`; };
const overall = (scores: {subFC: number; subLR: number; subGRA: number; subP: number}) => Math.round((scores.subFC + scores.subLR + scores.subGRA + scores.subP) / 4 * 2) / 2;
const isAccessError = (error: unknown) => error instanceof DashboardError && error.status === 403 && ['auth_rejected', 'browser_direct', 'terms_required', 'registration_required', 'banned', 'suspended'].includes(error.code || '');

export function Dashboard({ completedRoomName, initData, userData, onProfileUpdated, onAccessLost, onOpenActiveCall, renderPractice }: Props) {
  const [view, setView] = useState<View>(() => {
    if (completedRoomName) return 'history';
    const value = new URLSearchParams(window.location.search).get('view');
    return views.some(item => item.id === value) ? value as View : 'practice';
  });
  const [feedback, setFeedback] = useState<Record<string, { message: string; error: boolean }>>({});
  const [savingSession, setSavingSession] = useState<Session | null>(null);
  const [delivered, setDelivered] = useState<Record<string, RecordingDeliveryStatus>>({});
  const [confirmRemove, setConfirmRemove] = useState<Partner | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [reportingSession, setReportingSession] = useState<Session | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'pending' | 'success' | 'error'>>({});
  const [ratingChoices, setRatingChoices] = useState<Record<string, number>>({});
  const [removingPartner, setRemovingPartner] = useState<string | null>(null);
  const animationTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [scores, setScores] = useState({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band });
  const currentView = useRef(view);
  currentView.current = view;
  const actionInFlight = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const alive = useRef(true);
  useEffect(() => { const timers = animationTimers.current; return () => { timers.forEach(timer => clearTimeout(timer)); timers.clear(); }; }, []);
  const botName = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botLink = (payload: string) => `https://t.me/${botName}?start=${encodeURIComponent(payload)}`;
  const reportError = useCallback((err: unknown) => {
    if (!alive.current || (err instanceof Error && err.name === 'AbortError')) return;
    if (isAccessError(err)) { onAccessLost(); return; }
    setError(err instanceof Error ? err.message : 'Please try again.');
  }, [onAccessLost]);
  useEffect(() => { alive.current = true; const requests = controllers.current; return () => { alive.current = false; for (const controller of requests) controller.abort(); requests.clear(); }; }, []);
  useEffect(() => { setScores({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band }); }, [userData.subFC, userData.subLR, userData.subGRA, userData.subP, userData.band]);

  const load = useCallback(async (target: View, signal: AbortSignal) => {
    if (target === 'practice') return;
    if (target === 'history') {
      const data = await dashboardRequest<{ sessions: Session[]; nextCursor: string | null }>(initData, completedRoomName ? `/sessions?roomName=${encodeURIComponent(completedRoomName)}` : '/sessions', { signal });
      if (!Array.isArray(data.sessions)) throw new Error('Your conversation could not be loaded. Please try again.');
      let items = data.sessions;
      const callId = completedRoomName ? null : new URLSearchParams(window.location.search).get('call');
      if (callId && !items.some(item => item.id === callId)) {
        const selected = await dashboardRequest<{ session: Session }>(initData, `/sessions/${encodeURIComponent(callId)}`, { signal });
        items = [selected.session, ...items];
      }
      if (signal.aborted || target !== currentView.current) return;
      setSessions(items); setNextCursor(data.nextCursor);
    } else if (target === 'partners') {
      const [saved, incoming] = await Promise.all([
        dashboardRequest<{ favorites: Partner[] }>(initData, '/favorites', { signal }),
        dashboardRequest<{ invitations: Invitation[] }>(initData, '/invitations', { signal }),
      ]);
      if (signal.aborted || target !== currentView.current) return;
      setPartners(saved.favorites); setInvitations(incoming.invitations);
    } else if (target === 'community' || target === 'leaderboard') {
      const data = await dashboardRequest<Community>(initData, '/community', { signal });
      if (!signal.aborted && target === currentView.current) setCommunity(data);
    } else if (target === 'upgrade') {
      return;
    } else {
      const data = await dashboardRequest<{ user: UserMatchData }>(initData, '/summary', { signal });
      if (!signal.aborted && target === currentView.current) onProfileUpdated({ ...userData, ...data.user });
    }
  // Account refresh deliberately uses the current profile without reloading on each edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, onProfileUpdated, completedRoomName]);
  useEffect(() => {
    if (view === 'practice') return;
    const controller = new AbortController(); controllers.current.add(controller);
    setLoading(true); setError(''); setFeedback({});
    void load(view, controller.signal).catch(reportError).finally(() => { controllers.current.delete(controller); if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, load, reportError, reload]);
  useEffect(() => {
    if (!completedRoomName) return;
    const controller = new AbortController();
    let checks = 0;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (controller.signal.aborted) return;
      try { await load('history', controller.signal); } catch (error) { reportError(error); }
      if (!controller.signal.aborted && ++checks < 15) timer = setTimeout(refresh, 2000);
    };
    timer = setTimeout(refresh, 2000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [completedRoomName, load, reportError]);
  useEffect(() => {
    if (view !== 'partners') return;
    let inFlight = false;
    let activeController: AbortController | undefined;
    const poll = async () => {
      if (document.visibilityState === 'hidden' || busy || inFlight) return;
      inFlight = true;
      const controller = new AbortController(); controllers.current.add(controller);
      activeController = controller;
      try {
        const data = await dashboardRequest<{ invitations: Invitation[] }>(initData, '/invitations', { signal: controller.signal });
        if (alive.current && currentView.current === 'partners') setInvitations(data.invitations);
      } catch (err) { reportError(err); }
      finally { controllers.current.delete(controller); inFlight = false; activeController = undefined; }
    };
    const timer = window.setInterval(() => void poll(), 10000);
    return () => { window.clearInterval(timer); activeController?.abort(); };
  }, [view, busy, initData, reportError]);
  useEffect(() => {
    const queued = Object.entries(delivered).filter(([, status]) => status === 'QUEUED');
    if (view !== 'history' || !queued.length) return;
    const controller = new AbortController(), requests = controllers.current; requests.add(controller);
    let checks = 0;
    const remaining = new Set(queued.map(([key]) => key));
    let timer: number;
    const check = async () => {
      if (controller.signal.aborted) return;
      if (document.visibilityState !== 'hidden') {
        checks++;
        for (const [key] of queued) {
          const [, sessionId, segmentId] = key.split(':');
          try {
            const data = await dashboardRequest<{ status: RecordingDeliveryStatus }>(initData, `/sessions/${sessionId}/recording-delivery`, { method: 'POST', body: JSON.stringify(segmentId === 'latest' ? {} : { segmentId }), signal: controller.signal });
            if (!controller.signal.aborted && ['SENT','UNCONFIRMED','FAILED'].includes(data.status)) {
              remaining.delete(key);
              setDelivered(previous => ({ ...previous, [key]: data.status }));
              setActionStates(previous => ({ ...previous, [key]: data.status === 'SENT' ? 'success' : 'error' }));
              setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: data.status === 'SENT' ? 'Sent to your PairTalk conversation in Telegram.' : '', error: false } }));
            }
          } catch (err) {
            if (isAccessError(err)) reportError(err);
          }
        }
      }
      if (!controller.signal.aborted && remaining.size && checks < 12) timer = window.setTimeout(() => void check(), 5000);
      else if (!controller.signal.aborted && remaining.size) {
        setDelivered(previous => { const updated = { ...previous }; remaining.forEach(key => { if (updated[key] === 'QUEUED') delete updated[key]; }); return updated; });
        setActionStates(previous => { const updated = { ...previous }; remaining.forEach(key => { updated[key] = 'error'; }); return updated; });
        setFeedback(previous => { const updated = { ...previous }; remaining.forEach(key => { updated[`session:${key.split(':')[1]}`] = { message: 'Still awaiting Telegram confirmation. Check again to refresh delivery.', error: true }; }); return updated; });
      }
    };
    timer = window.setTimeout(() => void check(), 5000);
    return () => { window.clearTimeout(timer); controller.abort(); requests.delete(controller); };
  }, [delivered, view, initData, reportError]);
  function actionFeedback(key: string, insideDialog = false) {
    if (!insideDialog && ((editingProfile && key === 'profile') || (savingSession && key === `session:${savingSession.id}`) || (reportingSession && key === `session:${reportingSession.id}`) || (confirmRemove && key === `partner:${confirmRemove.id}`))) return null;
    const value = feedback[key];
    if (insideDialog && !value?.error) return null;
    return value?.message && <p role={value.error ? 'alert' : 'status'} className={value.error ? 'action-error' : 'sr-only'}>{value.message}</p>;
  }
  function actionProps(path: string) { return { 'aria-busy': actionStates[path] === 'pending', 'data-state': actionStates[path] || 'idle' }; }
  function actionIcon(path: string, idle: ReactNode) { return actionStates[path] === 'pending' ? <PendingIcon /> : actionStates[path] === 'success' ? <Check size={16} aria-hidden="true" /> : idle; }
  async function run(path: string, method = 'POST', body?: unknown, message = 'Saved.', feedbackKey = 'page'): Promise<boolean> {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    const target = currentView.current;
    const actionKey = path === '/account' || path === '/invitations' ? feedbackKey : path;
    setBusy(true);
    setActionStates(previous => ({ ...previous, [actionKey]: 'pending' }));
    setFeedback(previous => ({ ...previous, [feedbackKey]: { message: '', error: false } }));
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const data = await dashboardRequest<{ activeCallId?: string }>(initData, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      if (!alive.current) return false;
      setActionStates(previous => ({ ...previous, [actionKey]: 'success' }));
      if (path === '/invitations') {
        const timer = setTimeout(() => {
          animationTimers.current.delete(timer);
          setActionStates(previous => previous[actionKey] === 'success' ? { ...previous, [actionKey]: 'idle' } : previous);
        }, 2000);
        animationTimers.current.add(timer);
      }
      setFeedback(previous => ({ ...previous, [feedbackKey]: { message, error: false } }));
      // Apply the acknowledged change even if the following refresh fails.
      if (currentView.current === target) {
        const match = path.match(/^\/sessions\/([^/]+)\/(rating|favorite|report)$/);
        if (match?.[2] === 'favorite') setSavingSession(null);
        if (match?.[2] === 'report') setReportingSession(null);
        if (match) setSessions(previous => previous.map(session => session.id !== match[1] ? session : {
          ...session, ...(match[2] === 'rating' ? { rating: (body as { stars: number }).stars } : match[2] === 'favorite' ? { saved: true } : { reported: true }),
        }));
        if (path === '/account') onProfileUpdated({ ...userData, ...(body as Partial<UserMatchData>) });
        if (method === 'DELETE' && path.startsWith('/favorites/')) {
          const partnerId = path.slice('/favorites/'.length);
          const wait = async (milliseconds: number) => {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || controller.signal.aborted) return;
            await new Promise<void>(resolve => {
            const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); };
            const timer = setTimeout(done, milliseconds);
            controller.signal.addEventListener('abort', done, {once: true});
            });
          };
          setConfirmRemove(null);
          await wait(260);
          if (!alive.current || controller.signal.aborted) return false;
          setRemovingPartner(partnerId);
          await wait(320);
          if (!alive.current || controller.signal.aborted) return false;
          setPartners(previous => previous.filter(partner => partner.id !== partnerId));
          setRemovingPartner(null);
        }
      }
      if (data.activeCallId) { openActiveCall(); return true; }
      if (currentView.current === target) {
        try { await load(target, controller.signal); }
        catch (err) { reportError(err); }
      }
      return true;
    } catch (err) {
      if (!alive.current || (err instanceof Error && err.name === 'AbortError')) return false;
      setActionStates(previous => ({ ...previous, [actionKey]: 'error' }));
      if (isAccessError(err)) reportError(err);
      else setFeedback(previous => ({ ...previous, [feedbackKey]: { message: err instanceof Error ? err.message : 'Please try again.', error: true } }));
      return false;
    } finally { controllers.current.delete(controller); actionInFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function sendRecording(sessionId: string, segmentId?: string) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const key = `audio:${sessionId}:${segmentId || 'latest'}`;
    setBusy(true);
    setActionStates(previous => ({ ...previous, [key]: 'pending' }));
    setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: '', error: false } }));
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const data = await dashboardRequest<{ status: RecordingDeliveryStatus }>(initData, `/sessions/${sessionId}/recording-delivery`, { method: 'POST', body: JSON.stringify({ ...(segmentId ? { segmentId } : {}), ...(delivered[key] === 'FAILED' ? { retry: true } : {}) }), signal: controller.signal });
      if (!alive.current) return;
      if (!['QUEUED', 'SENT', 'UNCONFIRMED', 'FAILED'].includes(data.status)) throw new Error('Delivery status is unavailable. Please retry.');
      setDelivered(previous => ({ ...previous, [key]: data.status }));
      setActionStates(previous => ({ ...previous, [key]: data.status === 'SENT' ? 'success' : data.status === 'QUEUED' ? 'pending' : 'error' }));
      setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: data.status === 'SENT' ? 'Sent to your PairTalk conversation in Telegram.' : data.status === 'QUEUED' ? 'Queued for Telegram. The bot will send your audio when delivery completes.' : '', error: false } }));
    } catch (err) {
      if (!alive.current || (err instanceof Error && err.name === 'AbortError')) return;
      if (isAccessError(err)) reportError(err);
      else { setActionStates(previous => ({ ...previous, [key]: 'error' })); setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: err instanceof Error ? err.message : 'Audio delivery is unavailable. Please retry.', error: true } })); }
    } finally { controllers.current.delete(controller); actionInFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function loadEarlier() {
    if (!nextCursor || actionInFlight.current) return;
    actionInFlight.current = true; setBusy(true);
    setActionStates(previous => ({ ...previous, earlier: 'pending' }));
    setFeedback(previous => ({ ...previous, earlier: { message: '', error: false } }));
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const data = await dashboardRequest<{ sessions: Session[]; nextCursor: string | null }>(initData, `/sessions?cursor=${encodeURIComponent(nextCursor)}`, { signal: controller.signal });
      if (alive.current && currentView.current === 'history') {
        setSessions(previous => [...previous, ...data.sessions.filter(item => !previous.some(existing => existing.id === item.id))]);
        setNextCursor(data.nextCursor);
      }
    } catch (err) {
      if (isAccessError(err)) reportError(err);
      else if (alive.current && !(err instanceof Error && err.name === 'AbortError')) setFeedback(previous => ({ ...previous, earlier: { message: err instanceof Error ? err.message : 'Please retry earlier conversations.', error: true } }));
    } finally {
      controllers.current.delete(controller); actionInFlight.current = false;
      if (alive.current) { setBusy(false); setActionStates(previous => ({ ...previous, earlier: 'idle' })); }
    }
  }
  function navigate(target: View) {
    setView(target);
    setFeedback({});
    const url = new URL(window.location.href);
    url.searchParams.set('view', target);
    url.searchParams.delete('call');
    window.history.replaceState(null, '', url);
    window.scrollTo(0, 0);
  }
  async function rateCall(sessionId: string, stars: number) {
    if (actionInFlight.current) return;
    setRatingChoices(previous => ({...previous, [sessionId]: stars}));
    const confirmed = await run(`/sessions/${sessionId}/rating`, 'POST', { stars }, 'Rating saved. Thank you.', `session:${sessionId}`);
    if (!alive.current) return;
    const clear = () => setRatingChoices(previous => { const next = {...previous}; delete next[sessionId]; return next; });
    if (!confirmed || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { clear(); return; }
    const timer = setTimeout(() => { animationTimers.current.delete(timer); clear(); }, 880);
    animationTimers.current.add(timer);
  }
  function openActiveCall() {
    navigate('practice');
    onOpenActiveCall();
  }
  const navigation = <DashboardMenu items={views} current={view} onNavigate={navigate} />;
  const shortcuts = <><DiscountOffers initData={initData} onAccessLost={onAccessLost}/><nav className="practice-shortcuts" aria-label="Practice shortcuts">
    <button type="button" onClick={() => navigate('history')}><History size={18} aria-hidden="true" /><span>History & audio</span></button>
    <button type="button" onClick={() => navigate('account')}><Settings size={18} aria-hidden="true" /><span>Account & limits</span></button>
  </nav></>;
  function audioButton(session: Session, segmentId?: string, index?: number) {
    const key = `audio:${session.id}:${segmentId || 'latest'}`;
    return <RecordingAction key={key} status={delivered[key]} state={actionStates[key] || 'idle'} busy={busy} index={index} onSend={() => void sendRecording(session.id, segmentId)} />;
  }
  if (view === 'practice') return renderPractice(navigation, shortcuts);
  const Container = completedRoomName ? 'div' : 'main';
  const Title = completedRoomName ? 'h2' : 'h1';
  return <Container className={completedRoomName ? "after-call-dashboard" : "app-shell dashboard-screen"}>
    {!completedRoomName && <header className="app-header"><Brand /><div className="app-header-actions">{navigation}</div></header>}
    <section key={view} className={`dashboard-content dashboard-view-${view}`} aria-busy={loading}>
      {!completedRoomName && <button type="button" className="text-button dashboard-back" aria-label="Back to practice" onClick={() => navigate('practice')}><ArrowLeft size={16} aria-hidden="true" /> Practice</button>}
      <Title className="dashboard-view-title">{completedRoomName ? 'Your conversation' : view === 'history' ? 'Call history' : view === 'partners' ? 'Saved partners' : view === 'community' ? 'Invites' : view === 'leaderboard' ? 'Hall of Fame' : view === 'upgrade' ? 'Upgrade' : 'Account'}</Title>
      {view === 'history' && <p className="dashboard-view-intro">Your conversations, recordings and feedback.</p>}
      {view === 'account' && <p className="dashboard-view-intro">Your allowance, speaking profile and preferences.</p>}
      {(view==='account'||view==='upgrade')&&<DiscountOffers initData={initData} onAccessLost={onAccessLost}/>}
      {error && <div className="dashboard-alert" role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => setReload(previous => previous + 1)}>Reload current view</button></div>}
      <span role="status" className="sr-only">{feedback.page?.message}</span>
      {loading && <p role="status" className="loading-state"><PendingIcon />Loading your {view === 'history' ? 'conversations' : view}…</p>}
      {!loading && view === 'history' && <>
        {!sessions.length && !error && <div className="dashboard-empty"><History size={28} aria-hidden="true" /><h2>{completedRoomName ? 'Finishing your conversation…' : 'Your first conversation is ahead.'}</h2><p>{completedRoomName ? 'Your feedback and audio actions will appear as soon as the call is saved. You can also open History & audio.' : 'Completed calls and available recordings will appear here.'}</p>{!completedRoomName && <button className="secondary-button" onClick={() => navigate('practice')}>Start practicing</button>}</div>}
        <div className="dashboard-cards">{sessions.map(session => <article className="dashboard-card hcard" key={session.id}>
          <p className="hcard__meta">{date(session.createdAt)} – {Math.floor(session.duration / 60)}m {session.duration % 60}s{session.status !== 'COMPLETED' && <> · {session.status.toLowerCase()}</>}</p>
          <div className="hcard__who"><h2 className="hcard__alias break-anywhere">{session.partnerAlias}</h2>{session.rating !== null && ratingChoices[session.id] === undefined && <span className={`hcard__rating ${actionStates[`/sessions/${session.id}/rating`] === 'success' ? 'is-new' : ''}`} aria-label={`Rated ${session.rating} out of 5`}>– {session.rating}/5 <Star size={16} fill="currentColor" aria-hidden="true" /></span>}
            <div className="hcard__marks">{session.saved && <HistoryMark kind="saved" acknowledged={actionStates[`/sessions/${session.id}/favorite`] === 'success'} />}{session.reported && <HistoryMark kind="reported" acknowledged={actionStates[`/sessions/${session.id}/report`] === 'success'} />}</div>
          </div>
          {session.status === 'COMPLETED' && <>
            <section className="history-recordings" aria-label={`Audio from your call with ${session.partnerAlias}`}>
              <div className="history-audio-heading"><Mic size={17} aria-hidden="true" /><h3>Saved audio</h3></div>
              {(session.recordings?.length || session.recordingAvailable) ? <div className="history-audio-actions">
                {!session.recordings?.length && session.recordingAvailable && audioButton(session)}
                {session.recordings?.map((segment, index) => <div className="history-audio-segment" key={segment.id}>{audioButton(session, segment.id, session.recordings!.length > 1 ? index : undefined)}<span className="history-audio-expiry">Available until {expiry(segment.expiresAt)}</span></div>)}
                {!session.recordings?.length && session.recordingExpiresAt && <span className="history-audio-expiry">Available until {expiry(session.recordingExpiresAt)}</span>}
              </div> : <p className="history-no-audio">No audio is available for this call.</p>}
            </section>
            {(session.rating === null || ratingChoices[session.id] !== undefined) && <div className={`hcard__rate dashboard-rating ${session.rating !== null ? 'is-done' : ''}`} {...actionProps(`/sessions/${session.id}/rating`)} aria-label={`Rate call with ${session.partnerAlias}`}>
              <p>{actionStates[`/sessions/${session.id}/rating`] === 'pending' ? <><PendingIcon />Saving your rating…</> : 'How was your call?'}</p>
              <div className="stars">{[1, 2, 3, 4, 5].map(stars => <button type="button" key={stars} disabled={busy || session.rating !== null} aria-pressed={session.rating !== null && stars <= session.rating} className={session.rating !== null && stars <= session.rating ? 'rated' : ''} aria-label={`${stars} star${stars > 1 ? 's' : ''}`} onClick={() => void rateCall(session.id, stars)}><Star size={24} fill={session.rating !== null && stars <= session.rating ? 'currentColor' : 'none'} style={{animationDelay:`${(stars - 1) * 70}ms`}} aria-hidden="true" /></button>)}</div>
            </div>}
            <div className="dashboard-actions hcard__actions">
              <MotionPresence duration={200} exitDelay={260}>{!session.saved && <button className="secondary-button" aria-label="Save partner" {...actionProps(`/sessions/${session.id}/favorite`)} disabled={busy} onClick={() => setSavingSession(session)}><Heart size={16} aria-hidden="true" />Save partner</button>}</MotionPresence>
              <MotionPresence duration={200} exitDelay={260}>{!session.reported && <button className="secondary-button danger-button" {...actionProps(`/sessions/${session.id}/report`)} disabled={busy} onClick={() => { setReportReason(''); setReportDetails(''); setReportingSession(session); }}><AlertTriangle size={16} aria-hidden="true" />Report</button>}</MotionPresence>
            </div>
          </>}
          {actionFeedback(`session:${session.id}`)}
        </article>)}</div>
        {nextCursor && <><button className="secondary-button" disabled={busy} {...actionProps('earlier')} onClick={() => void loadEarlier()}>{actionStates.earlier === 'pending' && <PendingIcon />}{actionStates.earlier === 'pending' ? 'Loading earlier conversations…' : 'Load earlier conversations'}</button>{actionFeedback('earlier')}</>}
      </>}
      {!loading && view === 'partners' && <>
        {invitations.map(invitation => <article className="dashboard-card invitation-card" key={invitation.id}><span className="eyebrow">{invitation.status === 'ACTIVE' ? 'Ready to join' : invitation.incoming ? 'Incoming invitation' : 'Waiting for your partner'}</span><h2>{invitation.partnerAlias}</h2><p>{invitation.status === 'ACTIVE' ? 'Your voice session is ready. Join when you are ready to turn on your microphone.' : 'Invitations expire after 60 seconds. No call starts until the invitation is accepted.'}</p><div className="dashboard-actions">{invitation.status === 'ACTIVE' ? <button className="primary-button" onClick={openActiveCall}>Open voice session</button> : invitation.incoming ? <><button className="primary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/accept`)} onClick={() => void run(`/invitations/${invitation.id}/accept`, 'POST', undefined, 'Invitation accepted.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/accept`, null)} {actionStates[`/invitations/${invitation.id}/accept`] === 'pending' ? 'Accepting…' : 'Accept invitation'}</button><button className="secondary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/decline`)} onClick={() => void run(`/invitations/${invitation.id}/decline`, 'POST', undefined, 'Invitation declined.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/decline`, null)} {actionStates[`/invitations/${invitation.id}/decline`] === 'pending' ? 'Declining…' : 'Decline'}</button></> : <button className="secondary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/cancel`)} onClick={() => void run(`/invitations/${invitation.id}/cancel`, 'POST', undefined, 'Invitation canceled.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/cancel`, null)} {actionStates[`/invitations/${invitation.id}/cancel`] === 'pending' ? 'Cancelling…' : 'Cancel invitation'}</button>}</div>{actionFeedback(`invitation:${invitation.id}`)}</article>)}
        {!partners.length && !error && <div className="dashboard-empty"><Heart size={28} aria-hidden="true" /><h2>No saved partners yet</h2><p>Save someone from your call history to invite them again.</p></div>}
        <div className="dashboard-cards">{partners.map(partner => <article className={`dashboard-card partner-row ${removingPartner === partner.id ? 'is-removing' : ''}`} key={partner.id}><h2 className="break-anywhere">{partner.alias}</h2><p className={`partner-availability ${partner.available ? 'is-available' : ''}`}>{partner.available ? 'Accepting invitations' : 'Unavailable right now'}</p><div className="dashboard-actions"><button className="primary-button" disabled={busy || !partner.available || (userData.callsRemaining ?? 0) <= 0 || invitations.length > 0} {...actionProps(`partner:${partner.id}`)} onClick={() => void run('/invitations', 'POST', { partnerId: partner.id }, 'Invitation sent.', `partner:${partner.id}`)}>{actionIcon(`partner:${partner.id}`, <Mic size={16} aria-hidden="true" />)} {actionStates[`partner:${partner.id}`] === 'pending' ? 'Sending invitation…' : actionStates[`partner:${partner.id}`] === 'success' ? 'Invitation sent' : 'Invite to call'}</button><button className="secondary-button danger-button" disabled={busy} onClick={() => setConfirmRemove(partner)}><Trash2 size={16} aria-hidden="true" />Remove</button></div>{actionFeedback(`partner:${partner.id}`)}</article>)}</div>
      </>}
      {!loading && view === 'community' && community && <>
        <div className="tiles"><div className="tile-stat"><span>Total invites</span><strong>{community.referrals.totalInvited}</strong></div><div className="tile-stat"><span>Bonus granted</span><strong className="accent">{community.referrals.qualifyingCompleted ?? '—'}</strong></div><div className="tile-stat"><span>Bonus pending</span><strong>{community.referrals.qualifyingCompleted === undefined ? '—' : Math.max(0, community.referrals.totalInvited - community.referrals.qualifyingCompleted)}</strong></div></div>
        <div className="invite-link"><label htmlFor="personal-invite-link">Your invite link</label><div className="invite-link-controls"><input id="personal-invite-link" readOnly value={botLink(community.referralPayload)} onFocus={event => event.target.select()} /><CopyButton value={botLink(community.referralPayload)} label="personal invite link" /></div></div>
        <p className="rule"><Clock size={16} aria-hidden="true" /><span>A bonus call is added after your invitee completes a call of at least 30 seconds. Bonus calls never expire.</span></p>
        <ul className="invitees">{community.referrals.rewards.map(reward => <li className="invitee" key={reward.id}><strong>{reward.referredAlias}</strong><span className={`chip ${reward.status === 'PENDING' ? 'chip--pending' : 'chip--ok'}`}>{reward.status === 'PENDING' ? 'Pending' : reward.status === 'AVAILABLE' ? 'Available' : reward.status.toLowerCase()}</span></li>)}</ul>
      </>}
      {!loading && view === 'leaderboard' && community && <>
        {!community.contest.leaderboard.length && <div className="dashboard-empty"><Trophy size={28} aria-hidden="true" /><h2>The next challenge is ahead.</h2><p>Qualifying invites will appear here when a contest begins.</p></div>}
        <ol className="lb">{community.contest.leaderboard.map(row => <li key={row.rank} className={row.alias === userData.alias ? 'is-you' : ''}><span className="leaderboard-rank">{row.rank}</span><b>{row.alias === userData.alias ? `You · ${row.alias}` : row.alias}</b><small>{row.invitesCount} invites</small></li>)}</ol>
      </>}
      {!loading && view === 'upgrade' && <Suspense fallback={<p role="status" className="loading-state"><PendingIcon />Loading plans…</p>}><PlansModal isOpen currentPlan={userData.plan} initData={initData} inline onClose={() => navigate('practice')} /></Suspense>}
      {!loading && view === 'account' && <div className="dashboard-cards">
        <article className="dashboard-card account-allowance" aria-label="Your limits"><div className="acc-head"><h2>Your limits</h2><span className="chip chip--info">{userData.creditOnly?'Pay as you go':userData.plan || 'Free'}</span></div><div className="limits"><div className="big"><span>Calls available</span><strong>{userData.callsRemaining ?? '—'}</strong></div><div><span>Per call</span><strong>{userData.maxCallDuration ?? '—'} min</strong></div><div><span>Recordings</span><strong>{userData.recordingsRemaining ?? '—'}</strong></div><div><span>Audio kept</span><strong>{userData.creditOnly?'Optional 30 days':`${userData.recordingRetentionDays ?? '—'} days`}</strong></div></div><AllowanceDetails userData={userData} /><button className="primary-button account-upgrade" type="button" onClick={() => navigate('upgrade')}><Sparkles size={17} aria-hidden="true" />{(userData.plan || 'FREE').toUpperCase() === 'FREE' ? 'Buy calls and recordings' : 'Buy calls and recordings'}</button></article>
        <article className="dashboard-card account-scores" aria-label="Speaking scores"><div className="acc-head"><h2>Speaking scores</h2><button type="button" className="secondary-button" aria-label="Edit scores" onClick={() => { setScores({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band }); setEditingProfile(true); }}><Edit3 size={16} aria-hidden="true" />Edit</button></div><div key={`${userData.subFC}-${userData.subLR}-${userData.subGRA}-${userData.subP}`} className={`scores score-summary ${actionStates.profile === 'success' ? 'is-updated' : ''}`}>{[['Fluency', userData.subFC ?? userData.band], ['Vocabulary', userData.subLR ?? userData.band], ['Grammar', userData.subGRA ?? userData.band], ['Pronunciation', userData.subP ?? userData.band], ['Overall band', overall({subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band})]].map(([label, value]) => <div className={`score ${label === 'Overall band' ? 'score--o' : ''}`} key={label}><span>{label}</span><strong>{Number(value).toFixed(1)}</strong></div>)}</div>{actionFeedback('profile')}</article>
        <article className="dashboard-card dnd" aria-label="Do not disturb"><p><strong>Do not disturb</strong><span>{actionStates.preferences === 'pending' ? 'Updating preference…' : userData.dnd ? 'On · invitations are paused.' : 'Off · saved partners can invite you.'}</span></p><button type="button" className="dnd-switch" {...actionProps('preferences')} role="switch" aria-label="Do not disturb" aria-checked={Boolean(userData.dnd)} disabled={busy} onClick={() => void run('/account', 'PATCH', { dnd: !userData.dnd }, userData.dnd ? 'Call invitations enabled.' : 'Do Not Disturb enabled.', 'preferences')}><span className="dnd-switch-track" aria-hidden="true"><span /></span></button>{actionFeedback('preferences')}</article>
        <div className="account-help"><a className="secondary-button" href="https://t.me/PairTalkSupport" target="_blank" rel="noopener noreferrer">Contact support</a><nav className="legal" aria-label="Policies"><a href={new URL('terms', publicSiteUrl).toString()} target="_blank" rel="noopener noreferrer">Terms</a><a href={new URL('privacy', publicSiteUrl).toString()} target="_blank" rel="noopener noreferrer">Privacy</a><a href={new URL('refund-policy', publicSiteUrl).toString()} target="_blank" rel="noopener noreferrer">Refund policy</a><a href={new URL('community-guidelines', publicSiteUrl).toString()} target="_blank" rel="noopener noreferrer">Guidelines</a></nav></div>
      </div>}
      <MotionPresence>{editingProfile && <DashboardDialog title="Edit your speaking scores" pending={busy} onClose={() => setEditingProfile(false)}>
        <form onSubmit={async event => { event.preventDefault(); if (await run('/account', 'PATCH', scores, 'Speaking profile updated.', 'profile')) setEditingProfile(false); }}>
          <div className="score-steppers">{([['subFC', 'Fluency and coherence'], ['subLR', 'Lexical resource'], ['subGRA', 'Grammar and accuracy'], ['subP', 'Pronunciation']] as const).map(([key, label]) => <div className="stepper" key={key}><b>{label}</b><button type="button" disabled={busy || scores[key] <= 0} aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => setScores(previous => ({...previous, [key]: Math.max(0, previous[key] - 0.5)}))}><Minus size={18} aria-hidden="true" /></button><output aria-label={label}>{scores[key].toFixed(1)}</output><button type="button" disabled={busy || scores[key] >= 9} aria-label={`Increase ${label.toLowerCase()}`} onClick={() => setScores(previous => ({...previous, [key]: Math.min(9, previous[key] + 0.5)}))}><Plus size={18} aria-hidden="true" /></button></div>)}<div className="stepper stepper--overall"><b>Overall</b><output>{overall(scores).toFixed(1)}</output></div></div>
          {actionFeedback('profile', true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditingProfile(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <PendingIcon />}{busy ? 'Saving…' : 'Save speaking scores'}</button></div>
        </form>
      </DashboardDialog>}</MotionPresence>
      <MotionPresence>{confirmRemove && <DashboardDialog title={`Delete ${confirmRemove.alias}?`} pending={busy} onClose={() => setConfirmRemove(null)}><p>Are you sure you want to delete {confirmRemove.alias}? This action cannot be undone!</p>{actionFeedback(`partner:${confirmRemove.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmRemove(null)}>No</button><button type="button" className="secondary-button danger-button" disabled={busy} onClick={async () => { if (await run(`/favorites/${confirmRemove.id}`, 'DELETE', undefined, 'Partner removed.', `partner:${confirmRemove.id}`)) { setConfirmRemove(null); setFeedback(previous => ({ ...previous, page: { message: 'Partner removed.', error: false } })); } }}>{busy && <PendingIcon />}{busy ? 'Removing…' : 'Yes, delete'}</button></div></DashboardDialog>}</MotionPresence>
      <MotionPresence>{savingSession && <DashboardDialog title="Save this partner?" pending={busy} onClose={() => setSavingSession(null)}><p>You can invite <strong>{savingSession.partnerAlias}</strong> to future calls.</p>{actionFeedback(`session:${savingSession.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setSavingSession(null)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={async () => { if (await run(`/sessions/${savingSession.id}/favorite`, 'POST', undefined, 'Partner saved.', `session:${savingSession.id}`)) setSavingSession(null); }}>{busy && <PendingIcon />}{busy ? 'Saving…' : 'Save partner'}</button></div></DashboardDialog>}</MotionPresence>
      <MotionPresence>{reportingSession && <DashboardDialog title="Report this partner" pending={busy} onClose={() => setReportingSession(null)}>
        <div className="report-intro"><span className="report-intro-icon"><AlertTriangle size={22} aria-hidden="true" /></span><p>Help keep speaking practice safe. What happened during your call with <strong>{reportingSession.partnerAlias}</strong>?</p></div>
        <fieldset className="report-reasons"><legend>Choose a reason</legend>{reasons.map(reason => <label className={`report-reason ${reportReason === reason ? 'is-selected' : ''}`} key={reason}><input type="radio" name="report-reason" value={reason} disabled={busy} checked={reportReason === reason} onChange={() => setReportReason(reason)} /><span>{reason}</span></label>)}</fieldset>
        <label className="field report-details" htmlFor="report-details"><span>Additional details <small>(optional)</small></span><textarea className="textarea" id="report-details" aria-describedby="report-details-help" rows={4} placeholder="Share anything that will help us understand what happened." maxLength={1000} disabled={busy} value={reportDetails} onChange={event => setReportDetails(event.target.value)} /></label><p className="report-details-help" id="report-details-help"><span>Your written details are kept private from this partner.</span><span>{reportDetails.length}/1000</span></p>
        {actionFeedback(`session:${reportingSession.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setReportingSession(null)}>Cancel</button><button type="button" className="secondary-button danger-button" disabled={busy || !reportReason} onClick={async () => { if (await run(`/sessions/${reportingSession.id}/report`, 'POST', { reason: reportReason, ...(reportDetails.trim() ? {details: reportDetails.trim()} : {}) }, 'Report submitted.', `session:${reportingSession.id}`)) setReportingSession(null); }}>{busy && <PendingIcon />}{busy ? 'Submitting…' : 'Submit report'}</button></div>
      </DashboardDialog>}</MotionPresence>
    </section>
    {!completedRoomName && <footer className="app-footer">© PairTalk {new Date().getFullYear()}. All rights reserved.</footer>}
  </Container>;
}
