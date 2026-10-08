import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Clock, Heart, History, Mic, Settings, Users, ArrowUpRight, Download, Star } from 'lucide-react';
import { PlansModal } from './PlansModal';
import { Brand } from './Brand';
import { DashboardError, dashboardRequest } from '../services/dashboard';
import type { UserMatchData } from '../types';

type View = 'practice' | 'history' | 'partners' | 'community' | 'account';
interface Session { recordings?: {id:string;createdAt:string;expiresAt:string}[]; id: string; partnerAlias: string; partnerBand: number; status: string; duration: number; createdAt: string; rating: number | null; reported: boolean; recordingAvailable: boolean; recordingExpiresAt: string | null }
interface Partner { id: string; alias: string; band: number; available: boolean }
interface Invitation { id: string; status: string; incoming: boolean; partnerAlias: string; expiresAt: string }
interface Community { referralPayload: string; referrals: { totalInvited: number; activeBonusCalls: number; rewards: { id: string; referredAlias: string; status: string; expiresAt: string }[] }; contest: { isActive: boolean; contest: { title: string; description: string | null } | null; leaderboard: { rank: number; alias: string; invitesCount: number }[] } }
interface Props { initData: string; userData: UserMatchData; onProfileUpdated: (data: UserMatchData) => void; onAccessLost: () => void; onOpenActiveCall: () => void; renderPractice: (navigation: ReactNode) => ReactNode }
const views: { id: View; label: string; icon: typeof Mic }[] = [
  { id: 'practice', label: 'Practice', icon: Mic }, { id: 'history', label: 'History & audio', icon: History }, { id: 'partners', label: 'Partners', icon: Heart }, { id: 'community', label: 'Community', icon: Users }, { id: 'account', label: 'Account', icon: Settings },
];
const reasons = ['Harassment', 'Hate speech', 'Explicit content', 'Spam or solicitation', 'Other unsafe behavior'];
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function Dashboard({ initData, userData, onProfileUpdated, onAccessLost, onOpenActiveCall, renderPractice }: Props) {
  const [view, setView] = useState<View>(() => {
    const value = new URLSearchParams(window.location.search).get('view');
    return views.some(item => item.id === value) ? value as View : 'practice';
  });
  const [plansOpen, setPlansOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [scores, setScores] = useState({ subFC: userData.subFC ?? userData.band, subLR: userData.subLR ?? userData.band, subGRA: userData.subGRA ?? userData.band, subP: userData.subP ?? userData.band });
  const currentView = useRef(view);
  currentView.current = view;
  const controllers = useRef(new Set<AbortController>());
  const alive = useRef(true);
  const botName = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const botLink = (payload: string) => `https://t.me/${botName}?start=${encodeURIComponent(payload)}`;
  const reportError = useCallback((err: unknown) => {
    if (!alive.current || (err instanceof Error && err.name === 'AbortError')) return;
    if (err instanceof DashboardError && err.status === 403 && ['auth_rejected', 'browser_direct', 'terms_required', 'registration_required', 'banned', 'suspended'].includes(err.code || '')) { onAccessLost(); return; }
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
    } else if (target === 'community') {
      const data = await dashboardRequest<Community>(initData, '/community', { signal });
      if (!signal.aborted && target === currentView.current) setCommunity(data);
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
    setLoading(true); setError(''); setNotice('');
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
  async function run(path: string, method = 'POST', body?: unknown, message = 'Saved.') {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const data = await dashboardRequest<{ activeCallId?: string }>(initData, path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      if (!alive.current) return;
      setNotice(message);
      if (data.activeCallId) { openActiveCall(); return; }
      await load(currentView.current, controller.signal);
    } catch (err) { reportError(err); }
    finally { controllers.current.delete(controller); if (alive.current) setBusy(false); }
  }
  async function download(sessionId: string, segmentId?: string) {
    if (busy) return;
    setBusy(true); setError('');
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const origin = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');
      const response = await fetch(`${origin}/api/calls/${encodeURIComponent(sessionId)}/recording?format=json${segmentId ? "&segment="+encodeURIComponent(segmentId) : ""}`, { headers: { 'x-telegram-init-data': initData, Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new DashboardError(failure.error || 'This recording is no longer available.', response.status, failure.code);
      }
      const anchor = document.createElement('a');
      let objectUrl: string | undefined;
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json(); const url = new URL(data.url);
        if (url.protocol !== 'https:') throw new Error('The recording link is unavailable.');
        anchor.href = url.toString(); anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      } else {
        objectUrl = URL.createObjectURL(await response.blob()); anchor.href = objectUrl;
      }
      if (controller.signal.aborted) { if (objectUrl) URL.revokeObjectURL(objectUrl); return; }
      anchor.download = `pairtalk-${sessionId}.ogg`; document.body.append(anchor); anchor.click(); anchor.remove();
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 60000);
    } catch (err) { reportError(err); }
    finally { controllers.current.delete(controller); if (alive.current) setBusy(false); }
  }
  function navigate(target: View) {
    setView(target);
    const url = new URL(window.location.href);
    url.searchParams.set('view', target);
    url.searchParams.delete('call');
    window.history.replaceState(null, '', url);
  }
  function openActiveCall() {
    navigate('practice');
    onOpenActiveCall();
  }
  const navigation = <nav className="dashboard-nav" aria-label="Your dashboard">{views.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}</nav>;
  if (view === 'practice') return renderPractice(navigation);
  return <main className="app-shell dashboard-screen">
    <header className="app-header"><Brand /><span className="status-pill">Your practice space</span></header>
    {navigation}
    <section className="dashboard-content" aria-busy={loading || busy}>
      <span className="eyebrow">{userData.alias}</span>
      <h1>{view === 'history' ? 'Every conversation counts.' : view === 'partners' ? 'Keep the good connections.' : view === 'community' ? 'Grow together.' : 'Make this space yours.'}</h1>
      <p className="intro-copy">{view === 'history' ? 'Review your calls, rate the experience and download available recordings.' : view === 'partners' ? 'Save partners after a call, then invite them back when you are both available.' : view === 'community' ? 'Invite another learner and follow the current community contest.' : 'Update your speaking scores and preferences. Payments stay in Telegram.'}</p>
      {error && <div className="dashboard-alert" role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => setReload(previous => previous + 1)}>Reload current view</button></div>}
      {notice && <p role="status" className="dashboard-notice">{notice}</p>}
      {loading && <p role="status" className="subtle-label">Loading your {view === 'history' ? 'conversations' : view}…</p>}
      {!loading && view === 'history' && <>
        {!sessions.length && !error && <div className="dashboard-empty"><History size={28} /><h2>Your first conversation is ahead.</h2><p>Completed calls and available recordings will appear here.</p><button className="secondary-button" onClick={() => navigate('practice')}>Start practicing</button></div>}
        <div className="dashboard-cards">{sessions.map(session => <article className="dashboard-card" key={session.id}>
          <div className="dashboard-card-heading"><div><span className="subtle-label">{date(session.createdAt)} · {session.status.toLowerCase()}</span><h2 className="break-anywhere">{session.partnerAlias}</h2></div><span className="status-pill">Band {session.partnerBand.toFixed(1)}</span></div>
          <p className="dashboard-meta"><Clock size={15} /> {Math.floor(session.duration / 60)}m {session.duration % 60}s</p>
          {session.status === 'COMPLETED' && <><div className="dashboard-rating" aria-label={`Rate call with ${session.partnerAlias}`}>{[1, 2, 3, 4, 5].map(stars => <button type="button" key={stars} disabled={busy || session.rating !== null} className={session.rating !== null && stars <= session.rating ? 'rated' : ''} aria-label={`${stars} star${stars > 1 ? 's' : ''}`} onClick={() => void run(`/sessions/${session.id}/rating`, 'POST', { stars }, 'Rating saved. Thank you.')}><Star size={21} fill={session.rating !== null && stars <= session.rating ? 'currentColor' : 'none'} /></button>)}<span className="subtle-label">{session.rating === null ? 'How was the call?' : 'Your rating'}</span></div>
          <div className="dashboard-actions"><button className="secondary-button" disabled={busy} onClick={() => void run(`/sessions/${session.id}/favorite`, 'POST', undefined, 'Partner saved. Find them in Partners.')}><Heart size={16} /> Save partner</button>{!session.recordings?.length && session.recordingAvailable && <button className="secondary-button" disabled={busy} onClick={() => void download(session.id)}><Download size={16} /> Download audio</button>}{session.recordings?.map((segment,index)=><button key={segment.id} className="secondary-button" disabled={busy} onClick={()=>void download(session.id,segment.id)}><Download size={16}/> Audio {session.recordings!.length>1 ? index+1 : ""} · until {date(segment.expiresAt)}</button>)}</div>
          {session.recordingExpiresAt && <p className="subtle-label">Available until {date(session.recordingExpiresAt)}. Download before it expires.</p>}
          {session.reported ? <p className="subtle-label">Report submitted.</p> : <details className="dashboard-report"><summary>Report a safety concern</summary><form onSubmit={event => { event.preventDefault(); const reason = new FormData(event.currentTarget).get('reason'); void run(`/sessions/${session.id}/report`, 'POST', { reason }, 'Report submitted.'); }}><label>What happened?<select name="reason" required>{reasons.map(reason => <option key={reason}>{reason}</option>)}</select></label><p>Reports are logged and may lead to moderation action. Submit only genuine concerns.</p><button className="secondary-button" disabled={busy}>Submit report</button></form></details>}</>}
        </article>)}</div>
        {nextCursor && <button className="secondary-button" disabled={busy} onClick={async () => { setBusy(true); const controller = new AbortController(); controllers.current.add(controller); try { const data = await dashboardRequest<{ sessions: Session[]; nextCursor: string | null }>(initData, `/sessions?cursor=${encodeURIComponent(nextCursor)}`, { signal: controller.signal }); if (alive.current && currentView.current === 'history') { setSessions(previous => [...previous, ...data.sessions.filter(item => !previous.some(existing => existing.id === item.id))]); setNextCursor(data.nextCursor); } } catch (err) { reportError(err); } finally { controllers.current.delete(controller); if (alive.current) setBusy(false); } }}>Load earlier conversations</button>}
      </>}
      {!loading && view === 'partners' && <>
        {invitations.map(invitation => <article className="dashboard-card invitation-card" key={invitation.id}><span className="eyebrow">{invitation.status === 'ACTIVE' ? 'Ready to join' : invitation.incoming ? 'Incoming invitation' : 'Waiting for your partner'}</span><h2>{invitation.partnerAlias}</h2><p>{invitation.status === 'ACTIVE' ? 'Your voice session is ready. Join when you are ready to turn on your microphone.' : 'Invitations expire after 60 seconds. No call starts until the invitation is accepted.'}</p><div className="dashboard-actions">{invitation.status === 'ACTIVE' ? <button className="primary-button" onClick={openActiveCall}>Open voice session</button> : invitation.incoming ? <><button className="primary-button" disabled={busy} onClick={() => void run(`/invitations/${invitation.id}/accept`)}>Accept invitation</button><button className="secondary-button" disabled={busy} onClick={() => void run(`/invitations/${invitation.id}/decline`)}>Decline</button></> : <button className="secondary-button" disabled={busy} onClick={() => void run(`/invitations/${invitation.id}/cancel`)}>Cancel invitation</button>}</div></article>)}
        {!partners.length && <div className="dashboard-empty"><Heart size={28} /><h2>Great practice partners are worth keeping.</h2><p>Save someone from your call history to invite them again.</p></div>}
        <div className="dashboard-cards">{partners.map(partner => <article className="dashboard-card" key={partner.id}><h2 className="break-anywhere">{partner.alias}</h2><p>Band {partner.band.toFixed(1)} · {partner.available ? 'Accepting invitations' : 'Unavailable right now'}</p><div className="dashboard-actions"><button className="primary-button" disabled={busy || !partner.available || (userData.callsRemaining ?? 0) <= 0 || invitations.length > 0} onClick={() => void run('/invitations', 'POST', { partnerId: partner.id }, 'Invitation sent.')}><Mic size={16} /> Invite to call</button><button className="text-button" disabled={busy} onClick={() => void run(`/favorites/${partner.id}`, 'DELETE', undefined, 'Partner removed.')}>Remove</button></div></article>)}</div>
      </>}
      {!loading && view === 'community' && community && <div className="dashboard-cards">
        <article className="dashboard-card"><span className="eyebrow">Invite another learner</span><h2>Practice is better with company.</h2><div className="practice-metrics"><div><span>Learners invited</span><strong>{community.referrals.totalInvited}</strong></div><div><span>Bonus calls available</span><strong>{community.referrals.activeBonusCalls}</strong></div></div><label>Your personal invite link<input readOnly value={botLink(community.referralPayload)} onFocus={event => event.target.select()} /></label><p>Rewards are credited after qualifying practice under the current referral rules. Existing rewards and their expiry appear below.</p><ul className="dashboard-rewards">{community.referrals.rewards.map(reward => <li key={reward.id}>{reward.referredAlias} · {reward.status.toLowerCase()}{reward.status === 'AVAILABLE' ? ` · until ${date(reward.expiresAt)}` : ''}</li>)}</ul></article>
        <article className="dashboard-card"><span className="eyebrow">Hall of fame</span><h2>{community.contest.contest?.title || 'Room for the next chapter.'}</h2><p>{community.contest.contest?.description || 'There is no active contest right now. Keep practicing and check back here.'}</p><ol className="dashboard-rewards">{community.contest.leaderboard.map(row => <li key={row.rank}><strong>{row.alias}</strong> · {row.invitesCount} qualifying invites</li>)}</ol></article>
      </div>}
      {!loading && view === 'account' && <div className="dashboard-cards">
        <article className="dashboard-card"><span className="eyebrow">Your speaking profile</span><h2 className="break-anywhere">{userData.alias}</h2><p>Your alias stays the same. Update your self-assessed scores when your speaking changes.</p><form onSubmit={event => { event.preventDefault(); void run('/account', 'PATCH', scores, 'Speaking profile updated.'); }}><div className="dashboard-score-grid">{([['subFC', 'Fluency & coherence'], ['subLR', 'Lexical resource'], ['subGRA', 'Grammar & accuracy'], ['subP', 'Pronunciation']] as const).map(([key, label]) => <label key={key}>{label}<select value={scores[key]} onChange={event => setScores(previous => ({ ...previous, [key]: Number(event.target.value) }))}>{Array.from({ length: 19 }, (_, index) => index / 2).map(value => <option value={value} key={value}>{value.toFixed(1)}</option>)}</select></label>)}</div><button className="primary-button" disabled={busy}>Save speaking scores</button></form></article>
        <article className="dashboard-card"><span className="eyebrow">Preferences & allowance</span><h2>{userData.plan} practice</h2><p>{userData.callsRemaining ?? 0} calls · {userData.recordingsRemaining ?? 0} recordings available<br />Up to {userData.maxCallDuration ?? '—'} minutes per call · {userData.recordingRetentionDays ?? '—'} days of audio retention</p><label className="dashboard-checkbox"><input type="checkbox" checked={Boolean(userData.dnd)} disabled={busy} onChange={event => void run('/account', 'PATCH', { dnd: event.target.checked }, event.target.checked ? 'Do Not Disturb enabled.' : 'Call invitations enabled.')} /><span>Do Not Disturb<small>Pause invitations from saved partners.</small></span></label><button type="button" className="secondary-button" onClick={() => setPlansOpen(true)}>Compare plans</button><a className="secondary-button" href={botLink('plans')}>Payments in Telegram <ArrowUpRight size={16} /></a><p className="subtle-label">For a refund, use /refund in the bot. For account deletion or a data request, contact support.</p><a className="text-button" href="https://t.me/PairTalkSupport" target="_blank" rel="noreferrer">Contact support</a><p className="subtle-label"><a href="https://pairtalk.online/terms" target="_blank" rel="noreferrer">Terms of Use</a> · <a href="https://pairtalk.online/privacy" target="_blank" rel="noreferrer">Privacy policy</a></p></article>
      </div>}
    </section>
    <PlansModal isOpen={plansOpen} currentPlan={userData.plan} onClose={() => setPlansOpen(false)} />
  </main>;
}
