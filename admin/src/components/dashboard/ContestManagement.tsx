import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatCard } from '../ui/StatCard.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import {
  Trophy,
  Users,
  Gift,
  Play,
  Pause,
  Save,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Flame
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

export function ContestManagement() {
  const [data, setData] = useState<ContestData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isToggling, setIsToggling] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [titleInput, setTitleInput] = useState<string>('');
  const [descriptionInput, setDescriptionInput] = useState<string>('');
  const [prizesInput, setPrizesInput] = useState<string>('');

  const fetchContest = async () => {
    setIsLoading(true);
    try {
      const json = await adminFetch<ContestData>('/api/admin/contest');
      setData(json);

      if (json.contest) {
        setTitleInput(json.contest.title || '');
        setDescriptionInput(json.contest.description || '');
        setPrizesInput(json.contest.prizes || '');
      } else {
        setTitleInput('IELTS Speaking Referral Championship');
        setDescriptionInput('Invite your friends to practice IELTS speaking! Top referrers win exclusive custom plans and prizes.');
        setPrizesInput('🥇 1st: 60-Day VIP Plan (90m Duration, 50 Calls)\n🥈 2nd: 30-Day BOSS Plan (90m Duration, 50 Calls)\n🥉 3rd: 14-Day PRO Plan (60m Duration, 25 Calls)');
      }
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to load contest data.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContest();
  }, []);

  const handleToggleActive = async () => {
    if (!data) return;
    setIsToggling(true);
    setFeedback(null);
    try {
      const nextState = !data.isActive;
      await adminFetch('/api/admin/contest/toggle', {
        method: 'POST',
        body: JSON.stringify({ isActive: nextState }),
      });
      await fetchContest();
      setFeedback({
        type: 'success',
        message: nextState ? '🏆 Hall of Fame championship is now LIVE!' : '⏸️ Hall of Fame contest has been paused.',
      });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to update contest status.' });
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveDetails = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      await adminFetch('/api/admin/contest', {
        method: 'POST',
        body: JSON.stringify({
          title: titleInput,
          description: descriptionInput,
          prizes: prizesInput,
        }),
      });
      await fetchContest();
      setFeedback({ type: 'success', message: '✅ Contest configuration saved successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to save contest settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !data) {
    return <LoadingSkeleton message="Retrieving Hall of Fame & Referral telemetry..." rows={4} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <PageHeader
        title="Hall of Fame & Contests"
        description="Organize periodic referral championships, configure exclusive tier prizes, and track top candidate referrers"
        actions={
          <button
            onClick={fetchContest}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem', padding: '0.5rem 0.875rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Top Banner & Quick Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        {/* Active Contest Status Card */}
        <div
          className="metric-card"
          style={{
            borderColor: data?.isActive ? 'rgba(16, 185, 129, 0.4)' : 'var(--border-card)',
            background: data?.isActive
              ? 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(6, 78, 59, 0.25))'
              : 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trophy size={18} color={data?.isActive ? '#fbbf24' : 'var(--text-muted)'} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Hall of Fame Standing
                </span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: data?.isActive ? '#34d399' : '#fb7185', marginTop: '0.4rem', letterSpacing: '-0.01em' }}>
                {data?.isActive ? 'ACTIVE & BROADCASTING' : 'OFFLINE / PAUSED'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isToggling}
              className={data?.isActive ? 'btn-danger' : 'btn-success'}
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            >
              {data?.isActive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Launch Live</>}
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            {data?.isActive ? 'Candidates see leaderboard and prize pool in bot' : 'Leaderboard paused (permanent bonus calls continue automatically)'}
          </div>
        </div>

        {/* Total Qualifying Referrals */}
        <StatCard
          label="Total Friends Bound"
          value={(data?.totalReferrals ?? 0).toLocaleString()}
          subValue="Unique candidate registrations via invite links"
          icon={<Users size={18} />}
          iconBg="rgba(6, 182, 212, 0.15)"
          iconColor="#38bdf8"
        />

        {/* Active Permanent Bonus Calls */}
        <StatCard
          label="Permanent Bonus Balance"
          value={(data?.activeBonusCalls ?? 0).toLocaleString()}
          subValue="Active bonus credits in circulation"
          icon={<Gift size={18} />}
          iconBg="rgba(168, 85, 247, 0.15)"
          iconColor="#c084fc"
        />
      </div>

      {feedback && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '10px',
            backgroundColor: feedback.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: feedback.type === 'success' ? '1px solid var(--success-border)' : '1px solid var(--danger-border)',
            color: feedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main 2-Column Grid: Left (Contest Settings), Right (Live Leaderboard) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Contest Settings Form */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Sparkles size={18} color="#fbbf24" />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Championship Terms & Prizes
            </h3>
          </div>

          <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Championship Title
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="e.g. Summer 2026 Referral Championship"
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Short Description & Motivation
              </label>
              <textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                rows={3}
                placeholder="Explain the rules and how candidates participate..."
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Prizes Breakdown (Markdown / Emojis)
              </label>
              <textarea
                value={prizesInput}
                onChange={(e) => setPrizesInput(e.target.value)}
                rows={5}
                placeholder="🥇 1st: 60-Day VIP Plan&#10;🥈 2nd: 30-Day BOSS Plan&#10;🥉 3rd: 14-Day PRO Plan"
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '0.825rem' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              <Save size={15} /> {isSaving ? 'Saving Changes...' : 'Save Championship Configuration'}
            </button>
          </form>
        </div>

        {/* Right Column: Live Leaderboard */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Flame size={18} color="#f59e0b" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Live Leaderboard (Top 10)
              </h3>
            </div>
            <button
              type="button"
              onClick={fetchContest}
              className="btn-secondary"
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {data?.leaderboard && data.leaderboard.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {data.leaderboard.map((entry) => {
                const isGold = entry.rank === 1;
                const isSilver = entry.rank === 2;
                const isBronze = entry.rank === 3;

                return (
                  <div
                    key={entry.userId}
                    className="glass-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1.125rem',
                      borderColor: isGold ? 'rgba(251, 191, 36, 0.4)' : isSilver ? 'rgba(148, 163, 184, 0.4)' : isBronze ? 'rgba(217, 119, 6, 0.4)' : 'var(--border-card)',
                      background: isGold
                        ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), var(--bg-surface-elevated))'
                        : isSilver
                        ? 'linear-gradient(135deg, rgba(148, 163, 184, 0.08), var(--bg-surface-elevated))'
                        : isBronze
                        ? 'linear-gradient(135deg, rgba(217, 119, 6, 0.08), var(--bg-surface-elevated))'
                        : 'var(--bg-surface-elevated)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <span style={{ fontSize: '1.25rem', minWidth: '28px', textAlign: 'center', fontWeight: 700 }}>
                        {isGold ? '🥇' : isSilver ? '🥈' : isBronze ? '🥉' : `#${entry.rank}`}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                          {entry.alias}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          TG: <code>{entry.telegramId}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="num-tabular" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#38bdf8' }}>
                        {entry.invitesCount}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                        qualifying
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Trophy size={36} color="#fbbf24" />}
              title="No qualifying referrals yet"
              description="Candidates who invite friends with qualifying practice calls (≥30s) will appear on the live leaderboard automatically."
            />
          )}
        </div>
      </div>
    </div>
  );
}
