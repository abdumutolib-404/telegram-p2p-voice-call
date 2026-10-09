import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock, Heart, History, Mic, Settings, Users, Trophy, Menu, X, Download, Star, Check, AlertTriangle, Sparkles, Edit3, ArrowLeft } from 'lucide-react';
import { CopyButton, LinkWithCopy, PendingIcon } from './CopyLink';
import { PlansModal } from './PlansModal';
import { DashboardDialog } from './DashboardDialog';
import { useModalDialog } from '../hooks/useModalDialog';
import { Brand } from './Brand';
import { DashboardError, dashboardRequest, publicSiteUrl } from '../services/dashboard';
import type { UserMatchData } from '../types';

type View = 'practice' | 'history' | 'partners' | 'community' | 'leaderboard' | 'account' | 'upgrade';
interface Session { recordings?: {id:string;createdAt:string;expiresAt:string}[]; id: string; partnerAlias: string; partnerBand: number; status: string; duration: number; createdAt: string; rating: number | null; reported: boolean; saved?: boolean; recordingAvailable: boolean; recordingExpiresAt: string | null }
interface Partner { id: string; alias: string; band: number; available: boolean }
interface Invitation { id: string; status: string; incoming: boolean; partnerAlias: string; expiresAt: string }
interface Community { referralPayload: string; referrals: { totalInvited: number; activeBonusCalls: number; rewards: { id: string; referredAlias: string; status: string; expiresAt: string | null }[] }; contest: { isActive: boolean; contest: { title: string; description: string | null } | null; leaderboard: { rank: number; alias: string; invitesCount: number }[] } }
interface Props { initData: string; userData: UserMatchData; onProfileUpdated: (data: UserMatchData) => void; onAccessLost: () => void; onOpenActiveCall: () => void; renderPractice: (navigation: ReactNode) => ReactNode }
const views: { id: View; label: string; icon: typeof Mic }[] = [
  { id: 'practice', label: 'Practice', icon: Mic }, { id: 'history', label: 'History & audio', icon: History }, { id: 'partners', label: 'Partners', icon: Heart }, { id: 'community', label: 'Invites', icon: Users }, { id: 'leaderboard', label: 'Hall of Fame', icon: Trophy }, { id: 'account', label: 'Account', icon: Settings }, { id: 'upgrade', label: 'Upgrade', icon: Sparkles },
];
const reasons = ['Harassment', 'Hate speech', 'Explicit content', 'Spam or solicitation', 'Other unsafe behavior'];
const date = (value: string | null | undefined) => { const parsed = value ? new Date(value) : null; return !parsed || Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const rewardExpiry = (value: string | null) => !value || new Date(value).getTime() === 0 ? 'Permanent' : `Available until ${date(value)}`;
const isAccessError = (error: unknown) => error instanceof DashboardError && error.status === 403 && ['auth_rejected', 'browser_direct', 'terms_required', 'registration_required', 'banned', 'suspended'].includes(error.code || '');

export function Dashboard({ initData, userData, onProfileUpdated, onAccessLost, onOpenActiveCall, renderPractice }: Props) {
  const [view, setView] = useState<View>(() => {
    const value = new URLSearchParams(window.location.search).get('view');
    return views.some(item => item.id === value) ? value as View : 'practice';
  });
  const [plansOpen, setPlansOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, { message: string; error: boolean }>>({});
  const [savingSession, setSavingSession] = useState<Session | null>(null);
  const [delivered, setDelivered] = useState<Record<string, 'QUEUED' | 'SENT'>>({});
  const [confirmRemove, setConfirmRemove] = useState<Partner | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [reportingSession, setReportingSession] = useState<Session | null>(null);
  const [reportReason, setReportReason] = useState(reasons[0]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionStates, setActionStates] = useState<Record<string, 'idle' | 'pending' | 'success' | 'error'>>({});
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [scores, setScores] = useState({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band });
  const currentView = useRef(view);
  currentView.current = view;
  const navigationRef = useModalDialog(menuOpen, () => setMenuOpen(false));
  const actionInFlight = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const alive = useRef(true);
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
      const data = await dashboardRequest<{ sessions: Session[]; nextCursor: string | null }>(initData, '/sessions', { signal });
      let items = data.sessions;
      const callId = new URLSearchParams(window.location.search).get('call');
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
  }, [initData, onProfileUpdated]);
  useEffect(() => {
    if (view === 'practice') return;
    const controller = new AbortController(); controllers.current.add(controller);
    setLoading(true); setError(''); setFeedback({});
    void load(view, controller.signal).catch(reportError).finally(() => { controllers.current.delete(controller); if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [view, load, reportError, reload]);
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
            const data = await dashboardRequest<{ status: 'QUEUED' | 'SENT' }>(initData, `/sessions/${sessionId}/recording-delivery`, { method: 'POST', body: JSON.stringify(segmentId === 'latest' ? {} : { segmentId }), signal: controller.signal });
            if (!controller.signal.aborted && data.status === 'SENT') {
              remaining.delete(key);
              setDelivered(previous => ({ ...previous, [key]: 'SENT' }));
              setActionStates(previous => ({ ...previous, [key]: 'success' }));
              setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: 'Sent to your PairTalk conversation in Telegram.', error: false } }));
            }
          } catch (err) {
            if (isAccessError(err)) reportError(err);
          }
        }
      }
      if (!controller.signal.aborted && checks < 12) timer = window.setTimeout(() => void check(), 5000);
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
      setFeedback(previous => ({ ...previous, [feedbackKey]: { message, error: false } }));
      // Apply the acknowledged change even if the following refresh fails.
      if (currentView.current === target) {
        const match = path.match(/^\/sessions\/([^/]+)\/(rating|favorite|report)$/);
        if (match) setSessions(previous => previous.map(session => session.id !== match[1] ? session : {
          ...session, ...(match[2] === 'rating' ? { rating: (body as { stars: number }).stars } : match[2] === 'favorite' ? { saved: true } : { reported: true }),
        }));
        if (path === '/account') onProfileUpdated({ ...userData, ...(body as Partial<UserMatchData>) });
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
      const data = await dashboardRequest<{ status: 'QUEUED' | 'SENT' }>(initData, `/sessions/${sessionId}/recording-delivery`, { method: 'POST', body: JSON.stringify(segmentId ? { segmentId } : {}), signal: controller.signal });
      if (!alive.current) return;
      if (!['QUEUED', 'SENT'].includes(data.status)) throw new Error('Delivery status is unavailable. Please retry.');
      setDelivered(previous => ({ ...previous, [key]: data.status }));
      setActionStates(previous => ({ ...previous, [key]: data.status === 'SENT' ? 'success' : 'pending' }));
      setFeedback(previous => ({ ...previous, [`session:${sessionId}`]: { message: data.status === 'SENT' ? 'Sent to your PairTalk conversation in Telegram.' : 'Queued for Telegram. The bot will send your audio when delivery completes.', error: false } }));
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
    setMenuOpen(false);
    setFeedback({});
    const url = new URL(window.location.href);
    url.searchParams.set('view', target);
    url.searchParams.delete('call');
    window.history.replaceState(null, '', url);
    window.scrollTo(0, 0);
  }
  function openActiveCall() {
    navigate('practice');
    onOpenActiveCall();
  }
  const navigation = <>
    <button type="button" className="dashboard-menu-button" aria-expanded={menuOpen} aria-controls="dashboard-navigation" onClick={() => setMenuOpen(value => !value)}><Menu size={19} aria-hidden="true" /><span>Menu</span></button>
    {menuOpen && <button type="button" className="dashboard-nav-scrim" data-modal-backdrop="" tabIndex={-1} aria-hidden="true" onClick={() => setMenuOpen(false)} />}
    {menuOpen && <div ref={navigationRef} id="dashboard-navigation" className="dashboard-nav is-open" role="dialog" aria-modal="true" aria-label="Dashboard menu" tabIndex={-1}><div className="dashboard-nav-heading"><strong>PairTalk</strong><button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)}><X size={18} /></button></div><nav aria-label="Your dashboard">{views.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}</nav></div>}
  </>;
  if (view === 'practice') return renderPractice(navigation);
  return <main className="app-shell dashboard-screen">
    <header className="app-header"><Brand /><div className="app-header-actions"><span className="header-alias">{userData.alias}</span>{navigation}</div></header>
    <section key={view} className={`dashboard-content dashboard-view-${view}`} aria-busy={loading}>
      <button type="button" className="text-button dashboard-back" onClick={() => navigate('practice')}><ArrowLeft size={16} aria-hidden="true" /> Back to practice</button>
      <h1>{view === 'history' ? 'Call history' : view === 'partners' ? 'Saved partners' : view === 'community' ? 'Invites & rewards' : view === 'leaderboard' ? 'Hall of Fame' : view === 'upgrade' ? 'Upgrade' : 'Account'}</h1>
      <p className="intro-copy">{view === 'history' ? 'Review your calls, rate the experience and send available recordings to Telegram.' : view === 'partners' ? 'Save partners after a call, then invite them back when you are both available.' : view === 'community' ? 'Invite another learner and track your referral rewards.' : view === 'leaderboard' ? 'See the current referral contest and its qualifying invites.' : view === 'upgrade' ? 'Compare current prices and allowances. Complete your payment in Telegram.' : 'Update your speaking scores and preferences. Payments stay in Telegram.'}</p>
      {error && <div className="dashboard-alert" role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => setReload(previous => previous + 1)}>Reload current view</button></div>}
      <span role="status" className="sr-only">{feedback.page?.message}</span>
      {loading && <p role="status" className="loading-state"><PendingIcon />Loading your {view === 'history' ? 'conversations' : view}…</p>}
      {!loading && view === 'history' && <>
        {!sessions.length && !error && <div className="dashboard-empty"><History size={28} /><h2>Your first conversation is ahead.</h2><p>Completed calls and available recordings will appear here.</p><button className="secondary-button" onClick={() => navigate('practice')}>Start practicing</button></div>}
        <div className="dashboard-cards">{sessions.map(session => <article className="dashboard-card" key={session.id}>
          <div className="dashboard-card-heading"><div><span className="subtle-label">{date(session.createdAt)} · {session.status.toLowerCase()}</span><h2 className="break-anywhere">{session.partnerAlias}</h2></div><span className="status-pill">Band {session.partnerBand.toFixed(1)}</span></div>
          <p className="dashboard-meta"><Clock size={15} /> {Math.floor(session.duration / 60)}m {session.duration % 60}s</p>
          {session.status === 'COMPLETED' && <><div className={`dashboard-rating ${actionStates[`/sessions/${session.id}/rating`] === 'success' ? 'is-confirmed' : ''}`} {...actionProps(`/sessions/${session.id}/rating`)} aria-label={`Rate call with ${session.partnerAlias}`}><span className="subtle-label">{actionStates[`/sessions/${session.id}/rating`] === 'pending' && <PendingIcon />}{actionStates[`/sessions/${session.id}/rating`] === 'pending' ? 'Saving your rating…' : session.rating === null ? 'How was the call?' : 'Call quality'}</span>{[1, 2, 3, 4, 5].map(stars => <button type="button" key={stars} disabled={busy || session.rating !== null} className={session.rating !== null && stars <= session.rating ? 'rated' : ''} aria-label={`${stars} star${stars > 1 ? 's' : ''}`} onClick={() => void run(`/sessions/${session.id}/rating`, 'POST', { stars }, 'Rating saved. Thank you.', `session:${session.id}`)}><Star style={{ animationDelay: `${(stars - 1) * 35}ms` }} size={21} fill={session.rating !== null && stars <= session.rating ? 'currentColor' : 'none'} /></button>)}</div>
          <div className="dashboard-actions"><button className={`secondary-button ${session.saved ? 'is-saved' : ''}`} {...actionProps(`/sessions/${session.id}/favorite`)} disabled={busy || Boolean(session.saved)} onClick={() => setSavingSession(session)}>{actionStates[`/sessions/${session.id}/favorite`] === 'pending' ? <PendingIcon /> : <Heart size={16} fill={session.saved ? 'currentColor' : 'none'} />} {session.saved ? 'Partner saved' : 'Save partner'}</button>{!session.recordings?.length && session.recordingAvailable && <button className="secondary-button" {...actionProps(`audio:${session.id}:latest`)} disabled={busy || Boolean(delivered[`audio:${session.id}:latest`])} onClick={() => void sendRecording(session.id)}>{actionIcon(`audio:${session.id}:latest`, <Download size={16} />)} {actionStates[`audio:${session.id}:latest`] === 'pending' && !delivered[`audio:${session.id}:latest`] ? 'Sending…' : delivered[`audio:${session.id}:latest`] === 'SENT' ? 'Sent to Telegram' : delivered[`audio:${session.id}:latest`] ? 'Queued for Telegram' : 'Send audio to Telegram'}</button>}{session.recordings?.map((segment,index)=><button key={segment.id} className="secondary-button" {...actionProps(`audio:${session.id}:${segment.id}`)} disabled={busy || Boolean(delivered[`audio:${session.id}:${segment.id}`])} onClick={()=>void sendRecording(session.id,segment.id)}>{actionIcon(`audio:${session.id}:${segment.id}`, <Download size={16}/>)} {actionStates[`audio:${session.id}:${segment.id}`] === 'pending' && !delivered[`audio:${session.id}:${segment.id}`] ? 'Sending…' : delivered[`audio:${session.id}:${segment.id}`] === 'SENT' ? 'Sent' : delivered[`audio:${session.id}:${segment.id}`] ? 'Queued' : 'Send audio'}{session.recordings!.length>1 ? ` ${index+1}` : ''} to Telegram</button>)}<button className={`secondary-button ${session.reported ? 'is-reported' : 'danger-button'}`} {...actionProps(`/sessions/${session.id}/report`)} disabled={busy || session.reported} onClick={() => { setReportReason(reasons[0]); setReportingSession(session); }}>{actionStates[`/sessions/${session.id}/report`] === 'pending' ? <PendingIcon /> : <AlertTriangle size={16} />} {session.reported ? 'Reported' : 'Report'}</button></div>
          {session.recordingExpiresAt && <p className="subtle-label">Available until {date(session.recordingExpiresAt)}. Download before it expires.</p>}
          {actionFeedback(`session:${session.id}`)}</>}
        </article>)}</div>
        {nextCursor && <><button className="secondary-button" disabled={busy} {...actionProps('earlier')} onClick={() => void loadEarlier()}>{actionStates.earlier === 'pending' && <PendingIcon />}{actionStates.earlier === 'pending' ? 'Loading earlier conversations…' : 'Load earlier conversations'}</button>{actionFeedback('earlier')}</>}
      </>}
      {!loading && view === 'partners' && <>
        {invitations.map(invitation => <article className="dashboard-card invitation-card" key={invitation.id}><span className="eyebrow">{invitation.status === 'ACTIVE' ? 'Ready to join' : invitation.incoming ? 'Incoming invitation' : 'Waiting for your partner'}</span><h2>{invitation.partnerAlias}</h2><p>{invitation.status === 'ACTIVE' ? 'Your voice session is ready. Join when you are ready to turn on your microphone.' : 'Invitations expire after 60 seconds. No call starts until the invitation is accepted.'}</p><div className="dashboard-actions">{invitation.status === 'ACTIVE' ? <button className="primary-button" onClick={openActiveCall}>Open voice session</button> : invitation.incoming ? <><button className="primary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/accept`)} onClick={() => void run(`/invitations/${invitation.id}/accept`, 'POST', undefined, 'Invitation accepted.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/accept`, null)} {actionStates[`/invitations/${invitation.id}/accept`] === 'pending' ? 'Accepting…' : 'Accept invitation'}</button><button className="secondary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/decline`)} onClick={() => void run(`/invitations/${invitation.id}/decline`, 'POST', undefined, 'Invitation declined.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/decline`, null)} {actionStates[`/invitations/${invitation.id}/decline`] === 'pending' ? 'Declining…' : 'Decline'}</button></> : <button className="secondary-button" disabled={busy} {...actionProps(`/invitations/${invitation.id}/cancel`)} onClick={() => void run(`/invitations/${invitation.id}/cancel`, 'POST', undefined, 'Invitation canceled.', `invitation:${invitation.id}`)}>{actionIcon(`/invitations/${invitation.id}/cancel`, null)} {actionStates[`/invitations/${invitation.id}/cancel`] === 'pending' ? 'Cancelling…' : 'Cancel invitation'}</button>}</div>{actionFeedback(`invitation:${invitation.id}`)}</article>)}
        {!partners.length && <div className="dashboard-empty"><Heart size={28} /><h2>Great practice partners are worth keeping.</h2><p>Save someone from your call history to invite them again.</p></div>}
        <div className="dashboard-cards">{partners.map(partner => <article className="dashboard-card" key={partner.id}><h2 className="break-anywhere">{partner.alias}</h2><p>Band {partner.band.toFixed(1)} · {partner.available ? 'Accepting invitations' : 'Unavailable right now'}</p><div className="dashboard-actions"><button className="primary-button" disabled={busy || !partner.available || (userData.callsRemaining ?? 0) <= 0 || invitations.length > 0} {...actionProps(`partner:${partner.id}`)} onClick={() => void run('/invitations', 'POST', { partnerId: partner.id }, 'Invitation sent.', `partner:${partner.id}`)}>{actionIcon(`partner:${partner.id}`, <Mic size={16} />)} {actionStates[`partner:${partner.id}`] === 'pending' ? 'Sending invitation…' : actionStates[`partner:${partner.id}`] === 'success' ? 'Invitation sent' : 'Invite to call'}</button><button className="text-button" disabled={busy} onClick={() => setConfirmRemove(partner)}>Remove</button></div>{actionFeedback(`partner:${partner.id}`)}</article>)}</div>
      </>}
      {!loading && view === 'community' && community && <div className="dashboard-cards">
        <article className="dashboard-card"><span className="eyebrow">Invite another learner</span><h2>Practice is better with company.</h2><div className="practice-metrics"><div><span>Learners invited</span><strong>{community.referrals.totalInvited}</strong></div><div><span>Bonus calls available</span><strong>{community.referrals.activeBonusCalls}</strong></div></div><div className="invite-link"><label htmlFor="personal-invite-link">Your personal invite link</label><div className="invite-link-controls"><input id="personal-invite-link" readOnly value={botLink(community.referralPayload)} onFocus={event => event.target.select()} /><CopyButton value={botLink(community.referralPayload)} label="personal invite link" /></div></div><p>Rewards are credited after a qualifying practice call of at least 30 seconds. Unused bonus calls do not expire.</p><ul className="dashboard-rewards">{community.referrals.rewards.map(reward => <li key={reward.id}><strong>{reward.referredAlias}</strong> · {reward.status.toLowerCase()}{reward.status === 'AVAILABLE' ? ` · ${rewardExpiry(reward.expiresAt)}` : ''}</li>)}</ul></article>
      </div>}
      {!loading && view === 'leaderboard' && community && <div className="dashboard-cards"><article className="dashboard-card"><span className="eyebrow">Hall of fame</span><h2>{community.contest.contest?.title || 'Room for the next chapter.'}</h2><p>{community.contest.contest?.description || 'There is no active contest right now. Keep practicing and check back here.'}</p><ol className="dashboard-rewards">{community.contest.leaderboard.map(row => <li key={row.rank}><strong>#{row.rank} {row.alias}</strong> · {row.invitesCount} qualifying invites</li>)}</ol></article></div>}
      {!loading && view === 'upgrade' && <div className="dashboard-cards"><article className="dashboard-card upgrade-card"><span className="eyebrow">Flexible options</span><h2>Choose your practice capacity.</h2><p>Compare each plan’s call allowance, maximum call length, recordings and retention. Check the validity shown before purchasing.</p><div className="allowance-grid"><div><strong>{userData.callsRemaining ?? 0}</strong><span>calls available</span></div><div><strong>{userData.recordingsRemaining ?? 0}</strong><span>recordings available</span></div><div><strong>{userData.recordingRetentionDays ?? '—'}</strong><span>retention days</span></div></div><button type="button" className="primary-button" onClick={() => setPlansOpen(true)}><Sparkles size={17} /> Compare current plans</button><p className="subtle-label">Payments and receipts stay in the PairTalk bot.</p></article></div>}
      {!loading && view === 'account' && <div className="dashboard-cards">
        <article className="dashboard-card"><h2>Speaking scores</h2><p>Your current self-assessment. Update it as you practice.</p><div key={`${userData.subFC}-${userData.subLR}-${userData.subGRA}-${userData.subP}`} className={`score-summary ${actionStates['profile'] === 'success' ? 'is-updated' : ''}`}>{([['FC', userData.subFC ?? userData.band], ['LR', userData.subLR ?? userData.band], ['GRA', userData.subGRA ?? userData.band], ['P', userData.subP ?? userData.band]] as const).map(([label, value]) => <span key={label}><strong>{Number(value).toFixed(1)}</strong><small>{label}</small></span>)}</div><button type="button" className="secondary-button" onClick={() => { setScores({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band }); setEditingProfile(true); }}><Edit3 size={16} /> Edit scores</button>{actionFeedback('profile')}</article>
        <article className="dashboard-card"><span className="eyebrow">Preferences & allowance</span><h2>{userData.plan} practice</h2><div className="allowance-grid"><div><strong>{userData.callsRemaining ?? 0}</strong><span>calls</span></div><div><strong>{userData.recordingsRemaining ?? 0}</strong><span>recordings</span></div><div><strong>{userData.recordingRetentionDays ?? '—'}</strong><span>retention days</span></div></div><p>Up to {userData.maxCallDuration ?? '—'} minutes per call.</p><button type="button" className="dnd-control" {...actionProps('preferences')} role="switch" aria-checked={Boolean(userData.dnd)} disabled={busy} onClick={() => void run('/account', 'PATCH', { dnd: !userData.dnd }, userData.dnd ? 'Call invitations enabled.' : 'Do Not Disturb enabled.', 'preferences')}>{actionStates['preferences'] === 'pending' ? <PendingIcon size={20} /> : <span className={`dnd-ring ${userData.dnd ? 'is-on' : 'is-off'}`} aria-hidden="true" />}<span>Do Not Disturb · {userData.dnd ? 'ON' : 'OFF'}<small>{actionStates['preferences'] === 'pending' ? 'Updating preference…' : userData.dnd ? 'Invitations are paused.' : 'Saved partners can invite you.'}</small></span></button>{actionFeedback('preferences')}<p className="subtle-label">For a refund, use /refund in the bot. For account deletion or a data request, contact support.</p><div className="account-links"><LinkWithCopy url="https://t.me/PairTalkSupport" label="Contact support" /><LinkWithCopy url={new URL('terms', publicSiteUrl).toString()} label="Terms of Use" /><LinkWithCopy url={new URL('privacy#refunds', publicSiteUrl).toString()} label="Privacy policy" /></div></article>
      </div>}
      {editingProfile && <DashboardDialog title="Edit your speaking scores" pending={busy} onClose={() => setEditingProfile(false)}>
        <form onSubmit={async event => { event.preventDefault(); if (await run('/account', 'PATCH', scores, 'Speaking profile updated.', 'profile')) setEditingProfile(false); }}>
          <div className="dashboard-score-grid">{([['subFC', 'Fluency & coherence'], ['subLR', 'Lexical resource'], ['subGRA', 'Grammar & accuracy'], ['subP', 'Pronunciation']] as const).map(([key, label]) => <label key={key}>{label}<select disabled={busy} value={scores[key]} onChange={event => setScores(previous => ({ ...previous, [key]: Number(event.target.value) }))}>{Array.from({ length: 19 }, (_, index) => index / 2).map(value => <option value={value} key={value}>{value.toFixed(1)}</option>)}</select></label>)}</div>
          {actionFeedback('profile', true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditingProfile(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <PendingIcon />}{busy ? 'Saving…' : 'Save speaking scores'}</button></div>
        </form>
      </DashboardDialog>}
      {confirmRemove && <DashboardDialog title={`Remove ${confirmRemove.alias}?`} pending={busy} onClose={() => setConfirmRemove(null)}>
        <p>They will disappear from Partners. You can save them again after a future call.</p>
        {actionFeedback(`partner:${confirmRemove.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmRemove(null)}>Keep partner</button><button type="button" className="primary-button danger-button" disabled={busy} onClick={async () => { if (await run(`/favorites/${confirmRemove.id}`, 'DELETE', undefined, 'Partner removed.', `partner:${confirmRemove.id}`)) { setConfirmRemove(null); setFeedback(previous => ({ ...previous, page: { message: 'Partner removed.', error: false } })); } }}>{busy && <PendingIcon />}{busy ? 'Removing…' : 'Remove partner'}</button></div>
      </DashboardDialog>}
      {savingSession && <DashboardDialog title={`Save ${savingSession.partnerAlias}?`} pending={busy} onClose={() => setSavingSession(null)}>
        <p>Add this learner to Partners so you can invite them to practice again.</p>
        {actionFeedback(`session:${savingSession.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setSavingSession(null)}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={async () => { if (await run(`/sessions/${savingSession.id}/favorite`, 'POST', undefined, 'Partner saved.', `session:${savingSession.id}`)) setSavingSession(null); }}>{busy && <PendingIcon />}{busy ? 'Saving…' : 'Save partner'}</button></div>
      </DashboardDialog>}
      {reportingSession && <DashboardDialog title="Report a safety concern" pending={busy} onClose={() => setReportingSession(null)}>
        <p>Reports are reviewed by the PairTalk team. Submit only a genuine concern.</p><label>Reason<select disabled={busy} value={reportReason} onChange={event => setReportReason(event.target.value)}>{reasons.map(reason => <option key={reason}>{reason}</option>)}</select></label>
        {actionFeedback(`session:${reportingSession.id}`, true)}<div className="dashboard-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setReportingSession(null)}>Cancel</button><button type="button" className="primary-button danger-button" disabled={busy} onClick={async () => { if (await run(`/sessions/${reportingSession.id}/report`, 'POST', { reason: reportReason }, 'Report submitted.', `session:${reportingSession.id}`)) setReportingSession(null); }}>{busy && <PendingIcon />}{busy ? 'Submitting…' : 'Submit report'}</button></div>
      </DashboardDialog>}
    </section>
    <PlansModal isOpen={plansOpen} currentPlan={userData.plan} onClose={() => setPlansOpen(false)} />
  </main>;
}
