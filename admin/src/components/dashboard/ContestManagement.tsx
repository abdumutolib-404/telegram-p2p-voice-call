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
        message: nextState ? 'Championship is now LIVE!' : 'Championship has been paused.',
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
      setFeedback({ type: 'success', message: 'Contest configuration saved successfully!' });
    } catch (err) {
      setFeedback({ type: 'error', message: 'Failed to save contest settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !data) {
    return <LoadingSkeleton message="Retrieving referral telemetry..." rows={4} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Hall of Fame & Contests"
        description="Organize referral championships, configure tier prize rewards, and track top referrers"
        actions={
          <button
            onClick={fetchContest}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Top Banner & Quick Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* Active Contest Status Card */}
        <div
          className="metric-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderColor: data?.isActive ? 'var(--success-border)' : 'var(--border-card)',
            backgroundColor: data?.isActive ? 'var(--success-bg)' : 'var(--bg-surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Championship Status
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: data?.isActive ? 'var(--success-text)' : 'var(--danger-text)', marginTop: '0.25rem' }}>
                {data?.isActive ? 'ACTIVE' : 'PAUSED'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleActive}
              disabled={isToggling}
              className={data?.isActive ? 'btn-danger' : 'btn-success'}
              style={{ height: '32px', fontSize: '0.75rem' }}
            >
              {data?.isActive ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Launch</>}
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {data?.isActive ? 'Visible to all candidates in Telegram Bot' : 'Leaderboard paused'}
          </div>
        </div>

        {/* Total Qualifying Referrals */}
        <StatCard
          label="Qualifying Referrals"
          value={(data?.totalReferrals ?? 0).toLocaleString()}
          subValue="Completed practice calls (≥30s)"
          icon={<Users size={16} />}
        />

        {/* Active Bonus Calls */}
        <StatCard
          label="Bonus Balance"
          value={(data?.activeBonusCalls ?? 0).toLocaleString()}
          subValue="Active bonus credits in circulation"
          icon={<Gift size={16} />}
        />
      </div>

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

      {/* 2-Column Grid: Form & Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Left Column: Form */}
        <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Sparkles size={16} color="var(--primary-light)" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Championship Configuration
            </h3>
          </div>

          <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Title
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="e.g. Referral Championship"
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Description
              </label>
              <textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                rows={3}
                placeholder="Instructions for participants..."
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Prizes Breakdown
              </label>
              <textarea
                value={prizesInput}
                onChange={(e) => setPrizesInput(e.target.value)}
                rows={4}
                placeholder="🥇 1st: 60-Day VIP Plan&#10;🥈 2nd: 30-Day BOSS Plan&#10;🥉 3rd: 14-Day PRO Plan"
                required
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: '0.8rem' }}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
              style={{ marginTop: '0.25rem', width: '100%', height: '38px' }}
            >
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        </div>

        {/* Right Column: Leaderboard */}
        <div className="glass-panel" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={16} color="var(--primary-light)" />
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Live Leaderboard (Top 10)
              </h3>
            </div>
            <button
              type="button"
              onClick={fetchContest}
              className="btn-secondary"
              style={{ padding: '0 0.6rem', height: '28px', fontSize: '0.75rem' }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {data?.leaderboard && data.leaderboard.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {data.leaderboard.map((entry) => {
                const isTop3 = entry.rank <= 3;

                return (
                  <div
                    key={entry.userId}
                    className="glass-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      backgroundColor: isTop3 ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                      borderColor: isTop3 ? 'var(--primary-border)' : 'var(--border-card)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.1rem', minWidth: '24px', textAlign: 'center', fontWeight: 700 }}>
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {entry.alias}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          TG: <code>{entry.telegramId}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="num-tabular" style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {entry.invitesCount}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>
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
              description="Candidates with verified practice calls (≥30s) will appear on the leaderboard automatically."
            />
          )}
        </div>
      </div>
    </div>
  );
}
