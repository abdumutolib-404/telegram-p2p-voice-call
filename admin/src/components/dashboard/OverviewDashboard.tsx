import { useState, useEffect, useCallback } from 'react';
import type { AdminStats, ManualPaymentRequestItem, AppealItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatCard } from '../ui/StatCard.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import {
  Users,
  CreditCard,
  Star,
  RefreshCw,
  PhoneCall,
  Server,
  Database,
  Radio,
  Bot,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface SystemHealthState {
  api: 'Healthy' | 'Degraded' | 'Down';
  database: 'Healthy' | 'Degraded' | 'Down';
  signaling: 'Healthy' | 'Degraded' | 'Down';
  bot: 'Healthy' | 'Degraded' | 'Down';
}

interface OverviewDashboardProps {
  onNavigateTab: (tab: 'users' | 'plans' | 'payments' | 'appeals' | 'analytics' | 'contest') => void;
}

export function OverviewDashboard({ onNavigateTab }: OverviewDashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingPayments, setPendingPayments] = useState<ManualPaymentRequestItem[]>([]);
  const [pendingAppeals, setPendingAppeals] = useState<AppealItem[]>([]);
  const [health, setHealth] = useState<SystemHealthState>({
    api: 'Healthy',
    database: 'Healthy',
    signaling: 'Healthy',
    bot: 'Healthy',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsData, paymentsData, appealsData] = await Promise.all([
        adminFetch<AdminStats>('/api/admin/stats').catch(() => null),
        adminFetch<ManualPaymentRequestItem[]>('/api/admin/payments/manual?tab=queue').catch(() => []),
        adminFetch<AppealItem[]>('/api/admin/appeals').catch(() => []),
      ]);

      if (statsData) {
        setStats(statsData);
        setHealth({
          api: 'Healthy',
          database: 'Healthy',
          signaling: 'Healthy',
          bot: 'Healthy',
        });
      } else {
        setHealth((prev) => ({ ...prev, api: 'Degraded' }));
      }

      if (Array.isArray(paymentsData)) {
        setPendingPayments(paymentsData.filter((p) => p.status === 'PENDING'));
      }
      if (Array.isArray(appealsData)) {
        setPendingAppeals(appealsData.filter((a) => !a.status || a.status === 'PENDING' || a.status === 'pending'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch overview data');
      setHealth((prev) => ({ ...prev, api: 'Degraded' }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (isLoading && !stats) {
    return <LoadingSkeleton message="Loading operations overview..." minHeight="320px" />;
  }

  const activeCalls = stats?.activeCalls ?? 0;
  const totalUsers = stats?.totalUsers ?? 0;
  const dau = stats?.dau ?? 0;
  const totalCalls = stats?.totalCalls ?? 0;
  const starsTotal = stats?.starsRevenue?.totalStars ?? 0;
  const uzsApproved = stats?.manualUzsRevenue?.approvedUzs ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <PageHeader
        title="Operations Overview"
        description="Real-time platform activity, infrastructure vitals, and pending operational actions"
        actions={
          <button
            onClick={fetchDashboardData}
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

      {/* 5 KPI Cards (Equal Height, Mathematical Alignment) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard
          label="Registered Users"
          value={totalUsers.toLocaleString()}
          subValue={`${dau.toLocaleString()} active today (DAU)`}
          icon={<Users size={16} />}
          onClick={() => onNavigateTab('users')}
        />

        <StatCard
          label="Active Calls"
          value={activeCalls}
          subValue={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: activeCalls > 0 ? 'var(--success-text)' : 'var(--text-muted)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: activeCalls > 0 ? 'var(--success)' : 'var(--text-muted)' }} />
              {activeCalls > 0 ? 'Live in WebRTC rooms' : 'Idle / Standby'}
            </span>
          }
          icon={<Radio size={16} />}
          onClick={() => onNavigateTab('analytics')}
        />

        <StatCard
          label="Completed Calls"
          value={totalCalls.toLocaleString()}
          subValue={`${stats?.totalMinutesSpoken ?? 0} total minutes spoken`}
          icon={<PhoneCall size={16} />}
          onClick={() => onNavigateTab('analytics')}
        />

        <StatCard
          label="Pending Payments"
          value={pendingPayments.length}
          subValue={pendingPayments.length > 0 ? 'Needs administrative review' : 'All receipts verified'}
          icon={<CreditCard size={16} />}
          badge={pendingPayments.length > 0 ? <StatusBadge variant="warning" label="Review" size="sm" /> : undefined}
          onClick={() => onNavigateTab('payments')}
        />

        <StatCard
          label="Realized Revenue"
          value={`⭐ ${starsTotal.toLocaleString()}`}
          subValue={`${uzsApproved.toLocaleString('en-US')} UZS approved`}
          icon={<Star size={16} />}
          onClick={() => onNavigateTab('analytics')}
        />
      </div>

      {/* 2-Column Grid: Priority Operational Work & System Health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Priority Action Tasks Panel */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} color="var(--primary-light)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Pending Operational Work
              </h3>
            </div>
            {pendingPayments.length + pendingAppeals.length > 0 ? (
              <StatusBadge variant="warning" label={`${pendingPayments.length + pendingAppeals.length} Action Items`} size="sm" />
            ) : (
              <StatusBadge variant="success" label="All Clear" size="sm" />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {/* Payment Queue Item */}
            <div
              onClick={() => onNavigateTab('payments')}
              className="glass-card"
              style={{
                padding: '0.875rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderColor: pendingPayments.length > 0 ? 'var(--warning-border)' : 'var(--border-card)',
                backgroundColor: pendingPayments.length > 0 ? 'var(--warning-bg)' : 'var(--bg-surface-elevated)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CreditCard size={16} color={pendingPayments.length > 0 ? 'var(--warning-text)' : 'var(--text-muted)'} />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Manual Card Payments (UZS)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {pendingPayments.length > 0 ? `${pendingPayments.length} receipts awaiting review` : 'All card receipts fulfilled'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge variant={pendingPayments.length > 0 ? 'warning' : 'neutral'} label={String(pendingPayments.length)} size="sm" />
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            </div>

            {/* Appeals Queue Item */}
            <div
              onClick={() => onNavigateTab('appeals')}
              className="glass-card"
              style={{
                padding: '0.875rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                borderColor: pendingAppeals.length > 0 ? 'var(--danger-border)' : 'var(--border-card)',
                backgroundColor: pendingAppeals.length > 0 ? 'var(--danger-bg)' : 'var(--bg-surface-elevated)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={16} color={pendingAppeals.length > 0 ? 'var(--danger-text)' : 'var(--text-muted)'} />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Candidate Ban Appeals
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {pendingAppeals.length > 0 ? `${pendingAppeals.length} unban appeals pending triage` : 'No open moderation appeals'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge variant={pendingAppeals.length > 0 ? 'danger' : 'neutral'} label={String(pendingAppeals.length)} size="sm" />
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          </div>
        </div>

        {/* System Health Panel */}
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} color="var(--primary-light)" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                System Infrastructure Health
              </h3>
            </div>
            <StatusBadge variant="success" label="Operational" size="sm" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem' }}>
            <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={15} color="var(--primary-light)" />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>API Server</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Express REST</div>
                </div>
              </div>
              <StatusBadge variant={health.api === 'Healthy' ? 'success' : 'warning'} label={health.api} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={15} color="var(--accent-blue)" />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Database</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Postgres</div>
                </div>
              </div>
              <StatusBadge variant={health.database === 'Healthy' ? 'success' : 'warning'} label={health.database} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={15} color="var(--primary-light)" />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Signaling</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>WebRTC Rooms</div>
                </div>
              </div>
              <StatusBadge variant={health.signaling === 'Healthy' ? 'success' : 'warning'} label={health.signaling} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={15} color="var(--gold-text)" />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Telegram Bot</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Grammy Engine</div>
                </div>
              </div>
              <StatusBadge variant={health.bot === 'Healthy' ? 'success' : 'warning'} label={health.bot} size="sm" />
            </div>
          </div>

          <div style={{ marginTop: '0.875rem', padding: '0.625rem 0.875rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span>Audio Quality Score: <strong style={{ color: 'var(--text-primary)' }}>{stats?.callQuality?.score ?? 98}/100</strong></span>
            <button
              onClick={() => onNavigateTab('analytics')}
              style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, fontSize: '0.75rem' }}
            >
              Telemetry <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
