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
    return <LoadingSkeleton message="Calculating analytics & telemetry..." rows={5} />;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Revenue & Platform Analytics"
        description="Realized financial metrics strictly separated by currency (Telegram Stars & Uzbek Som UZS) and WebRTC audio telemetry"
        actions={
          <button
            onClick={fetchStats}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        }
      />

      {error && (
        <div
          style={{
            padding: '0.875rem 1.125rem',
            borderRadius: '8px',
            backgroundColor: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            color: 'var(--danger-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Financial & Growth Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {/* Telegram Stars */}
        <StatCard
          label="Telegram Stars Revenue"
          value={`${defaultStats.starsRevenue.totalStars.toLocaleString()} Stars`}
          subValue={`$${defaultStats.starsRevenue.totalUsd.toLocaleString()} USD • ${defaultStats.starsRevenue.transactionCount ?? 0} orders`}
          icon={<Star size={16} />}
        />

        {/* Manual UZS */}
        <StatCard
          label="Card Revenue (UZS)"
          value={`${manualUzs.approvedUzs.toLocaleString('en-US')} UZS`}
          subValue={`${manualUzs.transactionCount} verified • ${manualUzs.pendingCount} pending`}
          icon={<CreditCard size={16} />}
        />

        {/* MAU */}
        <StatCard
          label="Monthly Active (MAU)"
          value={defaultStats.mau.toLocaleString()}
          subValue={`${defaultStats.dau.toLocaleString()} daily active candidates`}
          icon={<TrendingUp size={16} />}
        />

        {/* Total Calls */}
        <StatCard
          label="Completed Calls"
          value={(defaultStats.totalCalls ?? 0).toLocaleString()}
          subValue={`${defaultStats.totalMinutesSpoken ?? 0} min total audio runtime`}
          icon={<PhoneCall size={16} />}
        />
      </div>

      {/* WebRTC Quality & Telemetry */}
      <div className="glass-panel" style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--primary-light)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Audio Quality & WebRTC Stability
              </h3>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Reliability metrics derived from room completion rates, audio continuity, and recording egress
            </p>
          </div>

          <div>
            {defaultStats.callQuality?.score !== null && defaultStats.callQuality?.score !== undefined ? (
              <StatusBadge
                variant={defaultStats.callQuality.score >= 90 ? 'success' : defaultStats.callQuality.score >= 75 ? 'warning' : 'danger'}
                label={`${defaultStats.callQuality.score}/100 — ${defaultStats.callQuality.statusMessage}`}
              />
            ) : (
              <StatusBadge variant="neutral" label={`Sample: ${defaultStats.callQuality?.sampleSize ?? 0} calls`} />
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.875rem' }}>
          <div className="glass-card" style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Completion Rate</span>
            <div className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {defaultStats.callQuality?.completionRate ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completed normally</span>
          </div>

          <div className="glass-card" style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Audio Stream Stability</span>
            <div className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {defaultStats.callQuality?.audioReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zero premature drops</span>
          </div>

          <div className="glass-card" style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Recording Egress</span>
            <div className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {defaultStats.callQuality?.recordingReliability ?? 100}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Egress files stored</span>
          </div>

          <div className="glass-card" style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-elevated)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>Pre-Call Abort Rate</span>
            <div className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {defaultStats.callQuality?.cancellationRate ?? 0}%
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cancellations in queue</span>
          </div>
        </div>
      </div>

      {/* Monthly Stars Revenue History */}
      <div className="glass-panel" style={{ padding: '1.25rem', backgroundColor: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <BarChart2 size={16} color="var(--primary-light)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Monthly Telegram Stars Revenue History
          </h3>
        </div>

        {monthlyHistory.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
            No monthly revenue history recorded yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {monthlyHistory.map((item, idx) => {
              const barPercentage = Math.min(100, Math.max(4, (item.stars / maxMonthlyStars) * 100));
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.month}</span>
                    <span className="num-tabular" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                      {item.stars.toLocaleString()} Stars <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(${item.usd.toLocaleString()} USD)</span>
                    </span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: 'var(--bg-secondary)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPercentage}%`,
                      backgroundColor: 'var(--primary)',
                      height: '100%',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
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
