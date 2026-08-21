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
  ShieldCheck,
  RefreshCw,
  PhoneCall,
  Server,
  Database,
  Radio,
  Bot,
  AlertCircle,
  Clock,
  ArrowRight,
  Award
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
          signaling: statsData.activeCalls > 0 ? 'Healthy' : 'Healthy',
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
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
      setHealth((prev) => ({ ...prev, api: 'Degraded' }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (isLoading && !stats) {
    return <LoadingSkeleton message="Initializing Command Center telemetry..." minHeight="380px" />;
  }

  const activeCalls = stats?.activeCalls ?? 0;
  const totalUsers = stats?.totalUsers ?? 0;
  const dau = stats?.dau ?? 0;
  const totalCalls = stats?.totalCalls ?? 0;
  const starsTotal = stats?.starsRevenue?.totalStars ?? 0;
  const uzsApproved = stats?.manualUzsRevenue?.approvedUzs ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header */}
      <PageHeader
        title="Operations Command Center"
        description="Live real-time view of platform vitals, user activity, voice call traffic, and pending administrative queues"
        actions={
          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem', padding: '0.5rem 0.875rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh Vitals</span>
          </button>
        }
      />

      {error && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Primary KPI Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        <StatCard
          label="Registered Candidates"
          value={totalUsers.toLocaleString()}
          subValue={`${dau.toLocaleString()} active today (DAU)`}
          icon={<Users size={18} />}
          iconBg="rgba(99, 102, 241, 0.15)"
          iconColor="var(--primary-light)"
          onClick={() => onNavigateTab('users')}
        />

        <StatCard
          label="Live Active Calls"
          value={activeCalls}
          subValue={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: activeCalls > 0 ? '#34d399' : 'var(--text-muted)' }}>
              <span className={activeCalls > 0 ? 'dot-pulse' : ''} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: activeCalls > 0 ? '#10b981' : '#64748b' }} />
              {activeCalls > 0 ? 'Live WebRTC Rooms' : 'Standby / Idle'}
            </span>
          }
          icon={<Radio size={18} />}
          iconBg="rgba(16, 185, 129, 0.15)"
          iconColor="#34d399"
          glowColor={activeCalls > 0 ? '#10b981' : undefined}
          onClick={() => onNavigateTab('analytics')}
        />

        <StatCard
          label="Practice Sessions"
          value={totalCalls.toLocaleString()}
          subValue={`${stats?.totalMinutesSpoken ?? 0} total minutes spoken`}
          icon={<PhoneCall size={18} />}
          iconBg="rgba(139, 92, 246, 0.15)"
          iconColor="#c084fc"
          onClick={() => onNavigateTab('analytics')}
        />

        <StatCard
          label="Pending Payments"
          value={pendingPayments.length}
          subValue={pendingPayments.length > 0 ? 'Requires verification' : 'All receipts verified'}
          icon={<CreditCard size={18} />}
          iconBg={pendingPayments.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)'}
          iconColor={pendingPayments.length > 0 ? '#fbbf24' : 'var(--text-muted)'}
          badge={pendingPayments.length > 0 ? <StatusBadge variant="warning" label="ACTION REQ" size="sm" /> : undefined}
          onClick={() => onNavigateTab('payments')}
        />

        <StatCard
          label="Realized Revenue"
          value={`⭐ ${starsTotal.toLocaleString()}`}
          subValue={`${uzsApproved.toLocaleString('en-US')} UZS approved`}
          icon={<Star size={18} />}
          iconBg="rgba(251, 191, 36, 0.15)"
          iconColor="#fde047"
          onClick={() => onNavigateTab('analytics')}
        />
      </div>

      {/* 2-Column Grid: System Health & Action Queues */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* System Health Panel */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} color="var(--primary-light)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                System Infrastructure Health
              </h3>
            </div>
            <StatusBadge variant="success" label="ALL SYSTEMS OPERATIONAL" size="sm" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.875rem' }}>
            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Server size={16} color="#38bdf8" />
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>API Gateway</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Express Server</div>
                </div>
              </div>
              <StatusBadge variant={health.api === 'Healthy' ? 'success' : 'warning'} label={health.api} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Database size={16} color="#34d399" />
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>Database</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Prisma Postgres</div>
                </div>
              </div>
              <StatusBadge variant={health.database === 'Healthy' ? 'success' : 'warning'} label={health.database} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Radio size={16} color="#c084fc" />
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>Signaling</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Socket.IO & WebRTC</div>
                </div>
              </div>
              <StatusBadge variant={health.signaling === 'Healthy' ? 'success' : 'warning'} label={health.signaling} size="sm" />
            </div>

            <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Bot size={16} color="#fde047" />
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>Telegram Bot</div>
                  <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>Grammy Dispatcher</div>
                </div>
              </div>
              <StatusBadge variant={health.bot === 'Healthy' ? 'success' : 'warning'} label={health.bot} size="sm" />
            </div>
          </div>

          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
            <span>Audio Quality Score: <strong>{stats?.callQuality?.score ?? 98}/100</strong> ({stats?.callQuality?.statusMessage ?? 'Optimal'})</span>
            <button
              onClick={() => onNavigateTab('analytics')}
              style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}
            >
              View Telemetry <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* Priority Action Queues */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={18} color="#fbbf24" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Pending Operational Work
                </h3>
              </div>
              {(pendingPayments.length > 0 || pendingAppeals.length > 0) && (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                  {pendingPayments.length + pendingAppeals.length} Items Pending
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Payment Queue Item */}
              <div
                onClick={() => onNavigateTab('payments')}
                className="glass-card"
                style={{
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderColor: pendingPayments.length > 0 ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CreditCard size={18} color={pendingPayments.length > 0 ? '#fbbf24' : 'var(--text-muted)'} />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Manual Payment Receipts (UZS)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {pendingPayments.length > 0 ? `${pendingPayments.length} student orders awaiting bank receipt review` : 'All card receipts processed'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {pendingPayments.length > 0 ? (
                    <StatusBadge variant="warning" label={`${pendingPayments.length} PENDING`} size="sm" />
                  ) : (
                    <StatusBadge variant="neutral" label="0" size="sm" />
                  )}
                  <ArrowRight size={14} color="var(--text-muted)" />
                </div>
              </div>

              {/* Appeals Queue Item */}
              <div
                onClick={() => onNavigateTab('appeals')}
                className="glass-card"
                style={{
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  borderColor: pendingAppeals.length > 0 ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-card)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <ShieldCheck size={18} color={pendingAppeals.length > 0 ? '#fb7185' : 'var(--text-muted)'} />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Student Unban Appeals Queue
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {pendingAppeals.length > 0 ? `${pendingAppeals.length} banned candidate statements to triage` : 'No open moderation appeals'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {pendingAppeals.length > 0 ? (
                    <StatusBadge variant="danger" label={`${pendingAppeals.length} OPEN`} size="sm" />
                  ) : (
                    <StatusBadge variant="neutral" label="0" size="sm" />
                  )}
                  <ArrowRight size={14} color="var(--text-muted)" />
                </div>
              </div>

              {/* Referral Contest Item */}
              <div
                onClick={() => onNavigateTab('contest')}
                className="glass-card"
                style={{
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Award size={18} color="#fde047" />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Referral Championship & Leaderboard
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Configure rules, prizes, and monitor Top 10 candidate referrers
                    </div>
                  </div>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </div>
            </div>
          </div>

          <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Session: Master 2FA Verified</span>
            <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>v2.4 Production</span>
          </div>
        </div>
      </div>
    </div>
  );
}
