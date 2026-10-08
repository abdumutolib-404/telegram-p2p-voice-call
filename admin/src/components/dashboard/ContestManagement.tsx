import { Dialog } from '../ui/Dialog';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatCard } from '../ui/StatCard.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import {
  Trophy,
  Users,
  Gift,
  Play,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Award
} from 'lucide-react';


interface ContestLeaderboardEntry {
  rank: number;
  alias: string;
  telegramId: string;
  userId: string;
  invitesCount: number;
}

interface ContestData {
  isActive: boolean;
  contest: {
    id: string;
    title: string;
    description: string;
    prizes: string;
    startsAt: string;
    endsAt: string | null;
  } | null;
  leaderboard: ContestLeaderboardEntry[];
  totalReferrals?: number;
  activeBonusCalls?: number;
}

type ChampionshipState = 'NO_ACTIVE' | 'ACTIVE' | 'ENDED';

interface WizardFormState {
  title: string;
  description: string;
  prize1st: string;
  prize2nd: string;
  prize3rd: string;
  durationDays: number;
}

export function ContestManagement() {
  const [data, setData] = useState<ContestData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const actionBusy=useRef(false);
  const [actionError,setActionError]=useState<string|null>(null);
  // 4-Step Launch Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);

  const [wizardForm, setWizardForm] = useState<WizardFormState>({
    title: 'IELTS Speaking Referral Championship',
    description: 'Invite fellow learners to practice IELTS speaking! Top 3 referrers receive complimentary upgrades to BOSS, BOSS, and PRO plans.',
    prize1st: '60-Day BOSS Plan (90m Duration, 50 Calls)',
    prize2nd: '30-Day BOSS Plan (90m Duration, 50 Calls)',
    prize3rd: '14-Day PRO Plan (60m Duration, 25 Calls)',
    durationDays: 14,
  });

  // Conclude Championship Dialog State
  const [isConcludeDialogOpen, setIsConcludeDialogOpen] = useState<boolean>(false);
  const [isConcluding, setIsConcluding] = useState<boolean>(false);

  // Live Countdown State
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchContest = useCallback(async () => {
    setIsLoading(true);
    try {
      const json = await adminFetch<ContestData>('/api/admin/contest');
      setData(json);
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load championship telemetry.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContest();
  }, [fetchContest]);

  // Determine current 3-state championship lifecycle
  const championshipState = useMemo<ChampionshipState>(() => {
    if (!data) return 'NO_ACTIVE';
    if (data.isActive) {
      if (data.contest?.endsAt) {
        const endTs = new Date(data.contest.endsAt).getTime();
        if (endTs <= now) return 'ENDED';
      }
      return 'ACTIVE';
    }
    if (data.contest && data.contest.endsAt) {
      return 'ENDED';
    }
    return 'NO_ACTIVE';
  }, [data, now]);

  // Countdown calculations
  const countdownText = useMemo(() => {
    if (!data?.contest?.endsAt) return null;
    const endTs = new Date(data.contest.endsAt).getTime();
    const diff = endTs - now;

    if (diff <= 0) return 'Championship Concluded';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
  }, [data?.contest?.endsAt, now]);

  const openLaunchWizard = () => {
    setWizardStep(1);
    setIsWizardOpen(true);
    setFeedback(null);
  };

  const closeLaunchWizard = () => {
    if(actionBusy.current)return;
    setIsWizardOpen(false);
  };

  // Launch Championship via 4-Step Wizard
  const handleLaunchChampionship = async () => {
    if(actionBusy.current)return;
    if(!wizardForm.title.trim()||!wizardForm.description.trim()||!Number.isInteger(wizardForm.durationDays)||wizardForm.durationDays<1||wizardForm.durationDays>365){setActionError('Enter a title, description and whole duration between 1 and 365 days.');return;}
    actionBusy.current=true;setActionError(null);
    setIsLaunching(true);
    setFeedback(null);
    try {
      const endsAtDate = new Date(Date.now() + wizardForm.durationDays * 24 * 60 * 60 * 1000).toISOString();
      const consolidatedPrizes = `1st Place: ${wizardForm.prize1st}\n2nd Place: ${wizardForm.prize2nd}\n3rd Place: ${wizardForm.prize3rd}`;

      await adminFetch('/api/admin/contest', {
        method: 'POST',
        body: JSON.stringify({
          title: wizardForm.title.trim(),
          description: wizardForm.description.trim(),
          prizes: consolidatedPrizes,
          isActive: true,
          endsAt: endsAtDate,
        }),
      });

      await fetchContest();
      setIsWizardOpen(false);
      setFeedback({ type: 'success', message: 'Championship saved.' });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to launch championship.');
    } finally {
      actionBusy.current=false;setIsLaunching(false);
    }
  };

  // Atomic Prize Distribution & Conclusion Trigger
  const handleExecuteConclusion = async () => {
    if(actionBusy.current)return;actionBusy.current=true;setActionError(null);
    setIsConcluding(true);
    try {
      if(!data?.contest?.id)throw new Error('Select a contest before concluding it.');
      await adminFetch('/api/admin/contest/conclude',{method:'POST',body:JSON.stringify({contestId:data.contest.id})});

      await fetchContest();
      setIsConcludeDialogOpen(false);
      setFeedback({ type: 'success', message: 'Championship concluded! Prizes have been awarded atomically.' });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to conclude championship.');
    } finally {
      actionBusy.current=false;setIsConcluding(false);
    }
  };

  if (isLoading && !data) {
    return <LoadingSkeleton message="Retrieving championship telemetry..." rows={4} />;
  }

  if(!data)return <div role="alert" className="inline-error">{feedback?.message||'Contests are unavailable.'}<button className="btn-secondary" onClick={fetchContest}>Retry</button></div>;
  const top3Winners = data?.leaderboard.slice(0, 3) || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Contests"
        description="Manage referral contests, review the leaderboard and award prizes."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={fetchContest}
              disabled={isLoading}
              className="btn-secondary"
              style={{ fontSize: '0.825rem' }}
            >
              <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>

            {championshipState === 'NO_ACTIVE' && (
              <button
                onClick={openLaunchWizard}
                className="btn-primary"
                style={{ fontSize: '0.825rem' }}
              >
                <Play size={14} />
                <span>Launch Championship</span>
              </button>
            )}
          </div>
        }
      />

      {feedback && (
        <div
          style={{
            padding: '0.875rem 1.125rem',
            borderRadius: '8px',
            backgroundColor: feedback.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: feedback.type === 'success' ? '1px solid var(--success-border)' : '1px solid var(--danger-border)',
            color: feedback.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* STATE 1: NO ACTIVE CHAMPIONSHIP */}
      {championshipState === 'NO_ACTIVE' && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', backgroundColor: 'var(--bg-surface)' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-card)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.25rem',
              color: 'var(--primary-light)',
            }}
          >
            <Trophy size={32} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            No Active Championship
          </h2>
          <p style={{ maxWidth: '520px', margin: '0 auto 1.5rem auto', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5 }}>
            Organize competitive practice sprints for learners. Top referrers with verified partner calls will earn complimentary VIP, BOSS, and PRO subscription tiers.
          </p>
          <button
            onClick={openLaunchWizard}
            className="btn-primary"
            style={{ height: '40px', padding: '0 1.5rem', fontSize: '0.9rem' }}
          >
            <Play size={15} /> Create a contest
          </button>
        </div>
      )}

      {/* STATE 2: ACTIVE CHAMPIONSHIP */}
      {championshipState === 'ACTIVE' && (
        <>
          {/* Active Banner & Quick Telemetry */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1rem' }}>
            {/* Status & Live Countdown */}
            <div
              className="metric-card"
              style={{
                borderColor: 'var(--success-border)',
                backgroundColor: 'var(--success-bg)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Championship Status
                  </span>
                  <StatusBadge variant="success" label="Active" size="sm" />
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', marginTop: '0.4rem' }}>
                  {data?.contest?.title || 'Referral Championship'}
                </div>
              </div>

              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success-text)', fontSize: '0.75rem', fontWeight: 700 }}>
                  <Clock size={13} />
                  <span>Time Remaining:</span>
                </div>
                <div className="num-tabular" style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', marginTop: '0.2rem' }}>
                  {countdownText || 'Counting down...'}
                </div>
              </div>
            </div>

            {/* Qualifying Referrals */}
            <StatCard
              label="Qualifying Referrals"
              value={(data?.totalReferrals ?? 0).toLocaleString()}
              subValue="Completed practice calls (>=30s)"
              icon={<Users size={18} />}
            />

            {/* Active Bonus Calls */}
            <StatCard
              label="Bonus Balance"
              value={(data?.activeBonusCalls ?? 0).toLocaleString()}
              subValue="Bonus call credits in circulation"
              icon={<Gift size={18} />}
            />
          </div>

          {/* 2-Column Layout: Locked Configuration & Leaderboard snapshot */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1.25rem' }}>
            {/* Locked Configuration Details */}
            <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="var(--primary-light)" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Locked Configuration
                  </h3>
                </div>
                <StatusBadge variant="neutral" label="Immutable" size="sm" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Title
                  </span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                    {data?.contest?.title}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Participant Rules
                  </span>
                  <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.4 }}>
                    {data?.contest?.description}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Prize Pool Allocation
                  </span>
                  <div
                    style={{
                      marginTop: '0.35rem',
                      padding: '0.75rem',
                      backgroundColor: 'var(--bg-surface-elevated)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-card)',
                      fontFamily: 'var(--mono)',
                      fontSize: '0.8rem',
                      color: 'var(--text-primary)',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {data?.contest?.prizes}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Target End Date
                  </span>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.2rem' }}>
                    {data?.contest?.endsAt ? new Date(data.contest.endsAt).toLocaleString() : 'No expiry'}
                  </div>
                </div>

                <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>


                  <button
                    onClick={() => setIsConcludeDialogOpen(true)}
                    className="btn-danger"
                    style={{ width: '100%', fontSize: '0.825rem' }}
                  >
                    <Award size={14} /> Conclude Championship & Award Prizes
                  </button>
                </div>
              </div>
            </div>

            {/* Live Leaderboard */}
            <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trophy size={16} color="var(--gold-text)" />
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Leaderboard snapshot (Top 10)
                  </h3>
                </div>
                <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                  {data?.leaderboard.length || 0} Candidates
                </span>
              </div>

              {data?.leaderboard && data.leaderboard.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {data.leaderboard.map((entry) => {
                    const is1st = entry.rank === 1;
                    const is2nd = entry.rank === 2;
                    const is3rd = entry.rank === 3;
                    const isTop3 = is1st || is2nd || is3rd;

                    return (
                      <div
                        key={entry.userId}
                        className="glass-card"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.85rem 1rem',
                          backgroundColor: isTop3 ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                          borderColor: isTop3 ? 'var(--primary-border)' : 'var(--border-card)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span
                            className="badge"
                            style={{
                              minWidth: '32px',
                              height: '24px',
                              padding: '0',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.75rem',
                              backgroundColor: is1st ? 'var(--gold-bg)' : is2nd ? 'rgba(255,255,255,0.1)' : is3rd ? 'rgba(245,158,11,0.15)' : 'transparent',
                              color: is1st ? 'var(--gold-text)' : is2nd ? '#F8FAFC' : is3rd ? '#FDE68A' : 'var(--text-secondary)',
                              borderColor: is1st ? 'var(--gold-border)' : is2nd ? 'var(--border-strong)' : is3rd ? 'rgba(245,158,11,0.3)' : 'transparent',
                            }}
                          >
                            #{entry.rank}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                              {entry.alias}
                            </div>
                            <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)' }}>
                              TG: <code>{entry.telegramId}</code>
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span className="num-tabular" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                            {entry.invitesCount}
                          </span>
                          <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
                            invites
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={<Trophy size={32} color="var(--text-muted)" />}
                  title="No qualifying referrals yet"
                  description="Learners with verified practice calls (>=30s) will appear on the leaderboard automatically."
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* STATE 3: CHAMPIONSHIP ENDED */}
      {championshipState === 'ENDED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Concluded Notice Banner */}
          <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', backgroundColor: 'var(--bg-surface)', borderLeft: '4px solid var(--gold)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StatusBadge variant="gold" label="Championship Ended" size="sm" />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Concluded on {data?.contest?.endsAt ? new Date(data.contest.endsAt).toLocaleDateString() : 'Recent'}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.35rem 0 0 0' }}>
                  {data?.contest?.title || 'Referral Championship'} — Podium Summary
                </h3>
              </div>

              <button
                onClick={() => setIsConcludeDialogOpen(true)}
                className="btn-primary"
                style={{ fontSize: '0.825rem' }}
              >
                <Award size={14} /> Conclude and award prizes
              </button>
            </div>
          </div>

          {/* Podium Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
            {/* 1st Place */}
            <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--gold-border)', backgroundColor: 'var(--gold-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span className="badge badge-gold" style={{ fontWeight: 800 }}>1st Place</span>
                <Award size={18} color="var(--gold-text)" />
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                {top3Winners[0]?.alias || 'No Qualifier'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                TG: <code>{top3Winners[0]?.telegramId || '—'}</code>
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Invites:</span>
                <strong className="num-tabular" style={{ color: '#FFFFFF' }}>{top3Winners[0]?.invitesCount || 0}</strong>
              </div>
            </div>

            {/* 2nd Place */}
            <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--border-strong)', backgroundColor: 'var(--bg-surface-elevated)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span className="badge badge-neutral" style={{ fontWeight: 800, color: '#FFFFFF' }}>2nd Place</span>
                <Award size={18} color="var(--text-primary)" />
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                {top3Winners[1]?.alias || 'No Qualifier'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                TG: <code>{top3Winners[1]?.telegramId || '—'}</code>
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Invites:</span>
                <strong className="num-tabular" style={{ color: '#FFFFFF' }}>{top3Winners[1]?.invitesCount || 0}</strong>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="glass-card" style={{ padding: '1.25rem', borderColor: 'var(--border-card)', backgroundColor: 'var(--bg-surface-elevated)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span className="badge badge-neutral" style={{ fontWeight: 800, color: 'var(--warning-text)' }}>3rd Place</span>
                <Award size={18} color="var(--warning-text)" />
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF' }}>
                {top3Winners[2]?.alias || 'No Qualifier'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                TG: <code>{top3Winners[2]?.telegramId || '—'}</code>
              </div>
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Invites:</span>
                <strong className="num-tabular" style={{ color: '#FFFFFF' }}>{top3Winners[2]?.invitesCount || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4-STEP LAUNCH WIZARD MODAL */}
      {isWizardOpen && (
        <Dialog title="Launch contest" pending={isLaunching} onClose={() => { closeLaunchWizard(); }}><fieldset disabled={isLaunching} style={{border:0,padding:0,margin:0,minWidth:0}}>{actionError&&<p role="alert" className="inline-error">{actionError}</p>}
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Wizard Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="var(--primary-light)" />
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Championship Launch Wizard
                  </h3>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  Step {wizardStep} of 4: {wizardStep === 1 ? 'Championship Title' : wizardStep === 2 ? 'Participant Instructions' : wizardStep === 3 ? 'Award policy' : 'Duration & Confirmation'}
                </div>
              </div>
              <button
                onClick={closeLaunchWizard}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close wizard"
              >
                <X size={18} />
              </button>
            </div>

            {/* 4-Step Progress Bar */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem' }}>
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  style={{
                    flex: 1,
                    height: '4px',
                    borderRadius: '2px',
                    backgroundColor: step <= wizardStep ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    transition: 'background-color 0.2s ease',
                  }}
                />
              ))}
            </div>

            {/* STEP 1: TITLE */}
            {wizardStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Championship Title
                  </label>
                  <input aria-label="Championship Title"
                    type="text"
                    value={wizardForm.title}
                    onChange={(e) => setWizardForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. IELTS Speaking Referral Championship"
                    className="input-modern"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    autoFocus
                  />
                </div>

                <div style={{ padding: '0.875rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Presets:</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {[
                      'IELTS Speaking Referral Championship',
                      'PairTalk Spring Speaking Sprint',
                      'Global IELTS Referral Cup',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, title: preset }))}
                        className="btn-secondary"
                        style={{ fontSize: '0.725rem', height: '26px', padding: '0 0.5rem' }}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button onClick={closeLaunchWizard} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={() => setWizardStep(2)}
                    disabled={!wizardForm.title.trim()}
                    className="btn-primary"
                  >
                    Next: Description <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: DESCRIPTION */}
            {wizardStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Rules & Participant Instructions
                  </label>
                  <textarea aria-label="Rules & Participant Instructions"
                    rows={4}
                    value={wizardForm.description}
                    onChange={(e) => setWizardForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Instructions shown to candidates in the Telegram Bot..."
                    className="input-modern"
                    style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button onClick={() => setWizardStep(1)} className="btn-secondary">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(3)}
                    disabled={!wizardForm.description.trim()}
                    className="btn-primary"
                  >
                    Next: Prize Pool <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PRIZE POOL FOR 1ST, 2ND, 3RD PLACE */}
            {wizardStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Quick Prize Packages:</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>



                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--gold-text)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    1st Place Award
                  </label>
                  <p>1st: 60-day BOSS · 50 calls · 90 minutes · 15 recordings · 90-day retention</p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-primary)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    2nd Place Award
                  </label>
                  <p>2nd: 30-day BOSS · 50 calls · 90 minutes · 15 recordings · 90-day retention</p>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--warning-text)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    3rd Place Award
                  </label>
                  <p>3rd: 14-day PRO · 25 calls · 60 minutes · 7 recordings · 30-day retention</p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button onClick={() => setWizardStep(2)} className="btn-secondary">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={() => setWizardStep(4)}
                    disabled={!wizardForm.prize1st.trim() || !wizardForm.prize2nd.trim() || !wizardForm.prize3rd.trim()}
                    className="btn-primary"
                  >
                    Next: Duration & Review <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: DURATION & CONFIRMATION */}
            {wizardStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Championship Duration (Days)
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                      Ends: {new Date(Date.now() + wizardForm.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {[7, 14, 30, 60].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setWizardForm((prev) => ({ ...prev, durationDays: days }))}
                        className="btn-secondary"
                        style={{
                          height: '32px',
                          fontSize: '0.75rem',
                          backgroundColor: wizardForm.durationDays === days ? 'var(--primary-bg)' : undefined,
                          borderColor: wizardForm.durationDays === days ? 'var(--primary)' : undefined,
                          color: wizardForm.durationDays === days ? '#FFFFFF' : undefined,
                          fontWeight: 700,
                        }}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>
                </div>

                {/* Summary Box */}
                <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Launch Summary
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <div><strong>Title:</strong> {wizardForm.title}</div>
                    <div><strong>Duration:</strong> {wizardForm.durationDays} days</div>
                    <div><strong>1st Place:</strong> {wizardForm.prize1st}</div>
                    <div><strong>2nd Place:</strong> {wizardForm.prize2nd}</div>
                    <div><strong>3rd Place:</strong> {wizardForm.prize3rd}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <button onClick={() => setWizardStep(3)} className="btn-secondary">
                    <ChevronLeft size={14} /> Back
                  </button>
                  <button
                    onClick={handleLaunchChampionship}
                    disabled={isLaunching}
                    className="btn-success"
                    style={{ height: '36px' }}
                  >
                    <Check size={14} /> {isLaunching ? 'Launching...' : 'Confirm & Launch Championship'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </fieldset></Dialog>
      )}

      {/* Conclude Confirmation Dialog */}
      <ConfirmDialog
        error={actionError}
        isOpen={isConcludeDialogOpen}
        title="Conclude Championship & Distribute Prizes"
        message="This action will permanently end the current championship, freeze the leaderboard, and atomically grant the configured subscription tiers to the top 3 referrers."
        affectedItem={data?.contest?.title || 'Active Championship'}
        confirmLabel="Yes, Conclude & Award Prizes"
        severity="danger"
        isConfirming={isConcluding}
        onConfirm={handleExecuteConclusion}
        onCancel={() => setIsConcludeDialogOpen(false)}
      />
    </div>
  );
}
