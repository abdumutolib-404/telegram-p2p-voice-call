import { useState, useEffect } from 'react';
import { Trophy, Award, Users, Gift, Play, Pause, Save, RefreshCw, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { adminFetch } from '../../api/client.ts';

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
      console.error(err);
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
        message: nextState ? '🏆 Hall of Fame contest is now LIVE!' : '⏸️ Hall of Fame contest has been paused.',
      });
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to update contest status.' });
    } finally {
      setIsToggling(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
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
      setFeedback({ type: 'success', message: '✅ Contest settings updated successfully!' });
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Failed to save contest settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <RefreshCw size={24} className="animate-spin" />
        <span style={{ marginLeft: '0.75rem' }}>Loading Contest & Referral Engine...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Quick Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* Active Contest Status Card */}
        <div style={{
          backgroundColor: '#1e293b',
          border: data?.isActive ? '2px solid #22c55e' : '1px solid #334155',
          borderRadius: '12px',
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: data?.isActive ? 'linear-gradient(135deg, #1e293b 0%, #064e3b30 100%)' : '#1e293b'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Trophy size={20} color={data?.isActive ? '#eab308' : '#94a3b8'} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>Hall of Fame Status</h4>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 700, color: data?.isActive ? '#22c55e' : '#f87171', marginTop: '0.4rem' }}>
              {data?.isActive ? 'ACTIVE & LIVE' : 'OFFLINE / PAUSED'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={isToggling}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: data?.isActive ? '#dc2626' : '#16a34a',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: isToggling ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {data?.isActive ? <><Pause size={16} /> Stop Contest</> : <><Play size={16} /> Launch Contest</>}
          </button>
        </div>

        {/* Total Qualifying Referrals */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="#38bdf8" />
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>Total Referrals Bound</h4>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.4rem' }}>
            {data?.totalReferrals ?? 0}
          </div>
        </div>

        {/* Active Bonus Calls Awarded */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Gift size={20} color="#a855f7" />
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>Active Bonus Calls (Permanent)</h4>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f8fafc', marginTop: '0.4rem' }}>
            {data?.activeBonusCalls ?? 0}
          </div>
        </div>
      </div>

      {feedback && (
        <div style={{
          padding: '0.875rem 1.25rem',
          borderRadius: '8px',
          backgroundColor: feedback.type === 'success' ? '#064e3b40' : '#7f1d1d40',
          border: feedback.type === 'success' ? '1px solid #059669' : '1px solid #dc2626',
          color: feedback.type === 'success' ? '#34d399' : '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.9rem'
        }}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {feedback.message}
        </div>
      )}

      {/* Main 2-Column Grid: Left (Contest Settings), Right (Live Leaderboard) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Contest Settings Form */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
            <Sparkles size={20} color="#eab308" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
              Contest Rules & Prizes Config
            </h3>
          </div>

          <form onSubmit={handleSaveDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.4rem', fontWeight: 600 }}>
                Championship Title
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="e.g. Summer 2026 Referral Championship"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.625rem 0.85rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.4rem', fontWeight: 600 }}>
                Short Description & Terms
              </label>
              <textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                rows={3}
                placeholder="Explain the rules and how students participate..."
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.625rem 0.85rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.4rem', fontWeight: 600 }}>
                Prizes Breakdown (Markdown / Emojis)
              </label>
              <textarea
                value={prizesInput}
                onChange={(e) => setPrizesInput(e.target.value)}
                rows={5}
                placeholder="🥇 1st: 60-Day VIP Plan&#10;🥈 2nd: 30-Day BOSS Plan&#10;🥉 3rd: 14-Day PRO Plan"
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.625rem 0.85rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: '#0284c7',
                border: 'none',
                borderRadius: '8px',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Contest Details'}
            </button>
          </form>
        </div>

        {/* Right Column: Live Leaderboard */}
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Award size={20} color="#38bdf8" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                Live Leaderboard (Top 10)
              </h3>
            </div>
            <button
              type="button"
              onClick={fetchContest}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {data?.leaderboard && data.leaderboard.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {data.leaderboard.map((entry) => {
                const medalBg = entry.rank === 1 ? '#eab30820' : entry.rank === 2 ? '#94a3b820' : entry.rank === 3 ? '#b4530920' : '#0f172a';
                const medalBorder = entry.rank === 1 ? '#eab30860' : entry.rank === 2 ? '#94a3b860' : entry.rank === 3 ? '#b4530960' : '#334155';
                const medalIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`;

                return (
                  <div
                    key={entry.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: '8px',
                      backgroundColor: medalBg,
                      border: `1px solid ${medalBorder}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, minWidth: '24px' }}>
                        {medalIcon}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>
                          {entry.alias}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          TG ID: <code>{entry.telegramId}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>
                        {entry.invitesCount}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.25rem' }}>
                        qualifying
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              <Trophy size={32} style={{ margin: '0 auto 0.75rem auto', opacity: 0.4 }} />
              <div>No qualifying referrals recorded during this contest window yet.</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.35rem', color: '#475569' }}>
                Students who invite friends with qualifying sessions (≥30s) will appear here in real-time.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
