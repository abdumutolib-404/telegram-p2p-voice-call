import { useState, useEffect, useCallback } from 'react';
import type { AdminStats } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatCard } from '../ui/StatCard.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import {
  TrendingUp,
  PhoneCall,
  Star,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  AlertCircle,
  BarChart2
} from 'lucide-react';

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
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (isLoading && !stats) {
    return <LoadingSkeleton message="Calculating realized revenue & telemetry..." rows={5} />;
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
      <PageHeader
        title="Revenue & Platform Telemetry"
        description="Authoritative financial metrics strictly separated by currency (Telegram Stars & Uzbek Som UZS), session completion, and WebRTC stability"
        actions={
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem', padding: '0.5rem 0.875rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh Analytics</span>
          </button>
        }
      />

      {error && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Primary Financial & Growth Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        {/* Telegram Stars Revenue */}
        <StatCard
          label="Stars Revenue (XTR)"
          value={`⭐ ${defaultStats.starsRevenue.totalStars.toLocaleString()}`}
          subValue={`$${defaultStats.starsRevenue.totalUsd.toLocaleString()} USD • ${defaultStats.starsRevenue.transactionCount ?? 0} orders`}
          icon={<Star size={18} fill="#fde047" />}
          iconBg="rgba(251, 191, 36, 0.15)"
          iconColor="#fde047"
          glowColor="#f59e0b"
        />

        {/* Manual UZS Revenue */}
        <StatCard
          label="Card Revenue (UZS)"
          value={`${manualUzs.approvedUzs.toLocaleString('en-US')} UZS`}
          subValue={`${manualUzs.transactionCount} verified • ${manualUzs.pendingCount} pending`}
          icon={<CreditCard size={18} />}
          iconBg="rgba(16, 185, 129, 0.15)"
          iconColor="#34d399"
          glowColor="#10b981"
        />

        {/* Engagement / MAU */}
        <StatCard
          label="Monthly Active (MAU)"
          value={defaultStats.mau.toLocaleString()}
          subValue={`${defaultStats.dau.toLocaleString()} daily active candidates`}
          icon={<TrendingUp size={18} />}
          iconBg="rgba(6, 182, 212, 0.15)"
          iconColor="#38bdf8"
        />

        {/* Voice Practice Volume */}
        <StatCard
          label="Total Completed Calls"
          value={(defaultStats.totalCalls ?? 0).toLocaleString()}
          subValue={`${defaultStats.totalMinutesSpoken ?? 0} min total audio runtime`}
          icon={<PhoneCall size={18} />}
          iconBg="rgba(139, 92, 246, 0.15)"
          iconColor="#c084fc"
        />
      </div>

      {/* Audio Quality & Session Telemetry */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={20} color="var(--primary-light)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Audio Quality & WebRTC Stability
              </h3>
            </div>
            <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.825rem' }}>
              Measurable reliability score derived from session completion, packet drop rates, and recording egress success
            </p>
          </div>

          <div>
            {defaultStats.callQuality?.score !== null && defaultStats.callQuality?.score !== undefined ? (
              <StatusBadge
                variant={defaultStats.callQuality.score >= 90 ? 'success' : defaultStats.callQuality.score >= 75 ? 'warning' : 'danger'}
                label={`⭐ ${defaultStats.callQuality.score}/100 — ${defaultStats.callQuality.statusMessage}`}
              />
            ) : (
              <StatusBadge variant="neutral" label={`ℹ️ Insufficient Sample (${defaultStats.callQuality?.sampleSize ?? 0} sessions)`} />
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
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Audio Stream Stability</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.audioReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zero premature drops</span>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Recording Egress Success</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.recordingReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Storage files persisted & synced</span>
          </div>

          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Pre-Call Abort Rate</span>
            <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: '#fb7185', marginTop: '0.35rem' }}>
              {defaultStats.callQuality?.cancellationRate ?? 0}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cancellations during queue</span>
          </div>
        </div>
      </div>

      {/* Monthly Stars Revenue History */}
      <div className="glass-panel" style={{ padding: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <BarChart2 size={18} color="#fbbf24" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Monthly Telegram Stars (XTR) Revenue History
          </h3>
        </div>

        {monthlyHistory.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', fontStyle: 'italic' }}>
            No monthly revenue history recorded yet.
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
                  <div style={{ width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.05)', height: '8px', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPercentage}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                      height: '100%',
                      borderRadius: '9999px',
                      boxShadow: '0 0 10px rgba(245, 158, 11, 0.3)',
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
