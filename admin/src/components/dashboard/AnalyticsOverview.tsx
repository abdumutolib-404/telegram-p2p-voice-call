import { useState, useEffect, useCallback } from 'react';
import type { AdminStats } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Users, TrendingUp, PhoneCall, Star, RefreshCw, CreditCard, ShieldCheck } from 'lucide-react';

export function AnalyticsOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AdminStats>('/api/admin/stats');
      setStats(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch analytics statistics');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading && !stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '350px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem', color: 'var(--primary-light)' }} />
        <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>Loading real-time telemetry...</span>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="glass-panel" style={{ padding: '1.75rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)' }}>
        <p style={{ margin: '0 0 1rem 0', fontWeight: 600, color: '#fca5a5' }}>Telemetry Error: {error}</p>
        <button onClick={fetchStats} className="btn-danger">
          <RefreshCw size={16} /> Retry Connection
        </button>
      </div>
    );
  }

  const defaultStats: AdminStats = stats || {
    totalUsers: 0,
    mau: 0,
    dau: 0,
    activeCalls: 0,
    starsRevenue: {
      totalStars: 0,
      totalUsd: 0,
      monthlyHistory: [],
    },
    manualUzsRevenue: {
      approvedUzs: 0,
      transactionCount: 0,
      pendingUzs: 0,
      pendingCount: 0,
      rejectedUzs: 0,
      rejectedCount: 0,
    },
  };

  const monthlyHistory = defaultStats.starsRevenue?.monthlyHistory || [];
  const maxMonthlyStars = monthlyHistory.length > 0
    ? Math.max(...monthlyHistory.map((m) => m.stars), 1)
    : 1;

  const manualUzs = defaultStats.manualUzsRevenue || {
    approvedUzs: 0,
    transactionCount: 0,
    pendingUzs: 0,
    pendingCount: 0,
    rejectedUzs: 0,
    rejectedCount: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header bar with refresh & stats overview */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Analytics & Revenue Telemetry
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Real-time platform activity, Telegram Stars (XTR), and Manual UZS payment tracking
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={15} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh Data</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
        gap: '1.25rem',
      }}>
        {/* Card 1: Total Users */}
        <div className="metric-card">
          <div className="metric-card-glow" style={{ background: 'var(--primary)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Registered
            </span>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary-light)' }}>
              <Users size={20} />
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {defaultStats.totalUsers.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Lifetime student registrations
          </div>
        </div>

        {/* Card 2: Active Users (MAU / DAU) */}
        <div className="metric-card">
          <div className="metric-card-glow" style={{ background: '#10b981' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Engagement
            </span>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'var(--success-bg)', color: '#34d399' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {defaultStats.mau.toLocaleString()} <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500 }}>MAU</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#34d399', marginTop: '0.35rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#34d399' }} />
            {defaultStats.dau.toLocaleString()} Active Today (DAU)
          </div>
        </div>

        {/* Card 3: Calls Statistics & Live Radar */}
        <div className="metric-card">
          <div className="metric-card-glow" style={{ background: '#8b5cf6' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Voice Call Activity
            </span>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: '#c084fc' }}>
              <PhoneCall size={20} />
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {(defaultStats.totalCalls ?? 0).toLocaleString()} <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', fontWeight: 500 }}>calls</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{defaultStats.totalMinutesSpoken ?? 0}m spoken</span>
            <span>•</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#34d399', fontWeight: 600 }}>
              <span className="dot-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }} />
              {defaultStats.activeCalls} Live
            </span>
          </div>
        </div>

        {/* Card 4: Telegram Stars Revenue */}
        <div className="metric-card">
          <div className="metric-card-glow" style={{ background: '#f59e0b' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Stars Revenue (XTR)
            </span>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'var(--gold-bg)', color: '#fde047' }}>
              <Star size={20} />
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '2rem', fontWeight: 700, color: '#fde047', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '-0.02em' }}>
            <Star size={22} fill="#fde047" />
            {defaultStats.starsRevenue.totalStars.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>${defaultStats.starsRevenue.totalUsd.toLocaleString()} USD</span>
            <span>•</span>
            <span>{defaultStats.starsRevenue.transactionCount ?? 0} orders</span>
          </div>
        </div>

        {/* Card 5: Manual UZS Revenue */}
        <div className="metric-card">
          <div className="metric-card-glow" style={{ background: '#06b6d4' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Card Revenue (UZS)
            </span>
            <div style={{ padding: '0.5rem', borderRadius: '10px', backgroundColor: 'var(--info-bg)', color: '#38bdf8' }}>
              <CreditCard size={20} />
            </div>
          </div>
          <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', letterSpacing: '-0.02em' }}>
            {manualUzs.approvedUzs.toLocaleString('en-US')} <span style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-secondary)' }}>UZS</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{manualUzs.transactionCount} verified</span>
            {manualUzs.pendingCount > 0 && (
              <>
                <span>•</span>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>{manualUzs.pendingCount} pending</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Call Quality & Telemetry Section */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} color="var(--primary-light)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Audio Quality & Session Telemetry
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
              Real-time score derived from call completions, WebRTC stability, and recording egress success
            </p>
          </div>

          <div>
            {defaultStats.callQuality?.score !== null && defaultStats.callQuality?.score !== undefined ? (
              <span className={`badge ${defaultStats.callQuality.score >= 90 ? 'badge-success' : defaultStats.callQuality.score >= 75 ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
                ⭐ {defaultStats.callQuality.score}/100 — {defaultStats.callQuality.statusMessage}
              </span>
            ) : (
              <span className="badge badge-neutral" style={{ padding: '0.4rem 0.85rem' }}>
                ℹ️ Insufficient Sample Size ({defaultStats.callQuality?.sampleSize ?? 0} sessions)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Completion Rate</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.completionRate ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Normal call conclusions</span>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Audio Stability</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.audioReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zero premature disconnects</span>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Recording Egress</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.recordingReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Files synced & persisted</span>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Abort / Cancel Rate</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fb7185', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.cancellationRate ?? 0}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aborted during queue</span>
          </div>
        </div>
      </div>

      {/* Revenue History Section */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1.25rem 0', color: 'var(--text-primary)' }}>
          Monthly Telegram Stars Revenue Trajectory
        </h3>

        {monthlyHistory.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            No monthly revenue history available yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {monthlyHistory.map((item, idx) => {
              const barPercentage = Math.min(100, Math.max(6, (item.stars / maxMonthlyStars) * 100));
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.month}</span>
                    <span className="num-tabular" style={{ color: '#fde047', fontWeight: 700 }}>
                      ⭐ {item.stars.toLocaleString()} Stars <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(${item.usd.toLocaleString()} USD)</span>
                    </span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.05)', height: '10px', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPercentage}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                      height: '100%',
                      borderRadius: '9999px',
                      boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                      transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
