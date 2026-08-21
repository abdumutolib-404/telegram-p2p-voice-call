import { useState, useEffect, useCallback } from 'react';
import type { UserItem, ModerationAction } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import {
  Search,
  AlertTriangle,
  Ban,
  ShieldCheck,
  RefreshCw,
  UserX,
  Zap,
  RotateCcw,
  Copy,
  Check,
  User
} from 'lucide-react';

export function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warned' | 'blocked' | 'banned'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Destructive Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    user: UserItem | null;
    action: ModerationAction | null;
    title: string;
    message: string;
    severity: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    user: null,
    action: null,
    title: '',
    message: '',
    severity: 'danger',
  });
  const [isConfirmingAction, setIsConfirmingAction] = useState<boolean>(false);

  // Plan & Limits Modal State
  const [planModalUser, setPlanModalUser] = useState<UserItem | null>(null);
  const [planTier, setPlanTier] = useState<'free' | 'plus' | 'pro' | 'boss'>('free');
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(3);
  const [maxDurationInput, setMaxDurationInput] = useState<number>(15);
  const [retentionOverrideInput, setRetentionOverrideInput] = useState<number | ''>('');
  const [recordingLimitInput, setRecordingLimitInput] = useState<number | ''>('');
  const [durationDaysInput, setDurationDaysInput] = useState<number | ''>(30);
  const [customPlanNameInput, setCustomPlanNameInput] = useState<string>('');
  const [resetDailyCallsCheckbox, setResetDailyCallsCheckbox] = useState<boolean>(false);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState<boolean>(false);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const endpoint = `/api/admin/users?${params.toString()}`;
      const data = await adminFetch<UserItem[]>(endpoint);
      setUsers(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch candidate roster.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timeout);
  }, [fetchUsers]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const triggerModerationConfirm = (user: UserItem, action: ModerationAction) => {
    let title = '';
    let message = '';
    let severity: 'danger' | 'warning' | 'info' = 'danger';

    if (action === 'ban') {
      title = 'Permanently Ban Candidate';
      message = `This will permanently revoke platform access for ${user.alias} (TG: ${user.telegramId}). They can only regain access via an unban appeal.`;
      severity = 'danger';
    } else if (action === 'block') {
      title = 'Suspend Candidate (6 Hours)';
      message = `This will temporarily suspend ${user.alias} for 6 hours. Their access will restore automatically afterwards.`;
      severity = 'warning';
    } else if (action === 'warn') {
      title = 'Issue Formal Warning';
      message = `A formal violation warning will be recorded and dispatched to ${user.alias} via the Telegram Bot.`;
      severity = 'warning';
    } else if (action === 'unblock' || action === 'unban') {
      title = 'Restore Candidate Access';
      message = `This will clear restrictions and restore ${user.alias} to Active standing.`;
      severity = 'info';
    }

    setConfirmDialog({
      isOpen: true,
      user,
      action,
      title,
      message,
      severity,
    });
  };

  const handleExecuteConfirmedAction = async () => {
    const { user, action } = confirmDialog;
    if (!user || !action) return;

    setIsConfirmingAction(true);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${user.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: 'Administrative action via Operations Console',
        }),
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, ...updatedUser } : u))
      );
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    } catch (err: unknown) {
      alert(`Moderation action failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const openPlanModal = (user: UserItem) => {
    setPlanModalUser(user);
    const rawTier = (user.planTier || 'free').toLowerCase();
    const tier: 'free' | 'plus' | 'pro' | 'boss' =
      rawTier === 'boss' ? 'boss' : rawTier === 'pro' ? 'pro' : rawTier === 'plus' ? 'plus' : 'free';
    setPlanTier(tier);
    setDailyLimitInput(user.dailyLimit ?? (tier === 'boss' || tier === 'pro' ? 999 : tier === 'plus' ? 10 : 3));
    setMaxDurationInput(user.maxDuration ?? (tier === 'boss' || tier === 'pro' ? 60 : tier === 'plus' ? 30 : 15));
    setRetentionOverrideInput(user.retentionOverride ? user.retentionOverride : '');
    setRecordingLimitInput(user.recordingLimitOverride ? user.recordingLimitOverride : '');
    setDurationDaysInput(30);
    setCustomPlanNameInput(user.customPlanName || '');
    setResetDailyCallsCheckbox(false);
  };

  const closePlanModal = () => {
    setPlanModalUser(null);
  };

  const handleApplyContestPreset = (preset: '1st' | '2nd' | '3rd' | 'vip') => {
    if (preset === '1st') {
      setPlanTier('boss');
      setCustomPlanNameInput('Contest 1st Place (VIP)');
      setDailyLimitInput(50);
      setMaxDurationInput(90);
      setRecordingLimitInput(15);
      setRetentionOverrideInput(90);
      setDurationDaysInput(60);
      setResetDailyCallsCheckbox(true);
    } else if (preset === '2nd') {
      setPlanTier('pro');
      setCustomPlanNameInput('Contest 2nd Place');
      setDailyLimitInput(25);
      setMaxDurationInput(60);
      setRecordingLimitInput(7);
      setRetentionOverrideInput(30);
      setDurationDaysInput(30);
      setResetDailyCallsCheckbox(true);
    } else if (preset === '3rd') {
      setPlanTier('plus');
      setCustomPlanNameInput('Contest 3rd Place');
      setDailyLimitInput(15);
      setMaxDurationInput(30);
      setRecordingLimitInput(5);
      setRetentionOverrideInput(14);
      setDurationDaysInput(14);
      setResetDailyCallsCheckbox(true);
    } else if (preset === 'vip') {
      setPlanTier('boss');
      setCustomPlanNameInput('PairTalk Ambassador');
      setDailyLimitInput(999);
      setMaxDurationInput(90);
      setRecordingLimitInput(20);
      setRetentionOverrideInput(90);
      setDurationDaysInput(90);
      setResetDailyCallsCheckbox(true);
    }
  };

  const handlePlanTierChange = (newTier: 'free' | 'plus' | 'pro' | 'boss') => {
    setPlanTier(newTier);
    if (newTier === 'boss' || newTier === 'pro') {
      setDailyLimitInput(999);
      setMaxDurationInput(60);
    } else if (newTier === 'plus') {
      setDailyLimitInput(10);
      setMaxDurationInput(30);
    } else {
      setDailyLimitInput(3);
      setMaxDurationInput(15);
    }
  };

  const handleSavePlan = async () => {
    if (!planModalUser) return;
    setIsSubmittingPlan(true);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${planModalUser.id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: planTier.toUpperCase(),
          dailyLimit: Number(dailyLimitInput),
          maxDuration: Number(maxDurationInput),
          retentionOverride: retentionOverrideInput !== '' ? Number(retentionOverrideInput) : null,
          recordingLimit: recordingLimitInput !== '' ? Number(recordingLimitInput) : null,
          durationDays: durationDaysInput !== '' ? Number(durationDaysInput) : 30,
          customPlanName: customPlanNameInput.trim() || null,
          resetDailyCalls: resetDailyCallsCheckbox,
        }),
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === planModalUser.id ? { ...u, ...updatedUser } : u))
      );
      closePlanModal();
    } catch (err: unknown) {
      alert(`Failed to update plan: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const getStatusBadgeComponent = (status: UserItem['status']) => {
    switch (status) {
      case 'active':
        return <StatusBadge variant="success" label="Active" size="sm" />;
      case 'warned':
        return <StatusBadge variant="warning" label="Warned" size="sm" />;
      case 'blocked':
        return <StatusBadge variant="danger" label="Suspended" size="sm" />;
      case 'banned':
        return <StatusBadge variant="danger" label="Banned" size="sm" />;
      default:
        return <StatusBadge variant="neutral" label={status} size="sm" />;
    }
  };

  const getTierBadgeComponent = (user: UserItem) => {
    if (user.customPlanName) {
      return <StatusBadge variant="gold" label={user.customPlanName} size="sm" />;
    }
    switch (user.planTier?.toLowerCase()) {
      case 'boss':
        return <StatusBadge variant="gold" label="BOSS" size="sm" />;
      case 'pro':
        return <StatusBadge variant="info" label="PRO" size="sm" />;
      case 'plus':
        return <StatusBadge variant="info" label="PLUS" size="sm" />;
      default:
        return <StatusBadge variant="neutral" label="FREE" size="sm" />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Candidate Roster"
        description="Search learners by alias or Telegram ID, inspect speaking limits, and manage moderation standing"
        actions={
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Search & Filter Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '400px' }}>
          <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alias or Telegram ID..."
            className="input-modern"
            style={{ width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-surface-elevated)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
          {(['all', 'active', 'warned', 'blocked', 'banned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '0.35rem 0.75rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: statusFilter === tab ? 'var(--primary-bg)' : 'transparent',
                color: statusFilter === tab ? '#FFFFFF' : 'var(--text-secondary)',
                fontWeight: statusFilter === tab ? 600 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.12s ease',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

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
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Candidate Table */}
      {isLoading && users.length === 0 ? (
        <LoadingSkeleton message="Searching candidate roster..." rows={6} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<User size={32} color="var(--text-muted)" />}
          title="No candidates found"
          description={searchQuery ? `No candidates matching "${searchQuery}".` : 'No candidates under the selected filter.'}
          action={
            searchQuery ? (
              <button onClick={() => setSearchQuery('')} className="btn-secondary" style={{ fontSize: '0.8rem' }}>
                Clear Search
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Telegram ID</th>
                <th>Plan Tier</th>
                <th>Monthly Calls Used / Limit</th>
                <th>Status</th>
                <th>Warnings</th>
                <th>IELTS Sub-scores</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{user.alias}</span>
                      <button
                        onClick={() => copyToClipboard(user.alias, `alias-${user.id}`)}
                        title="Copy alias"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                      >
                        {copiedId === `alias-${user.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{user.telegramId}</code>
                      <button
                        onClick={() => copyToClipboard(user.telegramId.toString(), `tg-${user.id}`)}
                        title="Copy Telegram ID"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                      >
                        {copiedId === `tg-${user.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td>
                    {getTierBadgeComponent(user)}
                    <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {user.retentionOverride ? `Retention: ${user.retentionOverride}d` : `Retention: ${user.planTier?.toLowerCase() === 'pro' ? 30 : user.planTier?.toLowerCase() === 'plus' ? 7 : 1}d`}
                    </div>
                  </td>
                  <td>
                    <span className="num-tabular" style={{
                      color: user.dailyLimit && user.dailyLimit >= 999 ? 'var(--success-text)' : (user.dailyCallsUsed ?? 0) >= (user.dailyLimit ?? 3) ? 'var(--danger-text)' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}>
                      {user.dailyCallsUsed ?? 0} / {user.dailyLimit && user.dailyLimit >= 999 ? '∞' : (user.dailyLimit ?? 3)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                      ({user.maxDuration ?? (user.planTier?.toLowerCase() === 'pro' ? 60 : user.planTier?.toLowerCase() === 'plus' ? 30 : 15)}m)
                    </span>
                  </td>
                  <td>{getStatusBadgeComponent(user.status)}</td>
                  <td>
                    <span style={{ color: (user.warningCount || 0) > 0 ? 'var(--warning-text)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {user.warningCount || 0}
                    </span>
                  </td>
                  <td>
                    {user.subscores ? (
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        FC:{user.subscores.fc} LR:{user.subscores.lr} GRA:{user.subscores.gra} P:{user.subscores.p}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {/* Harmless Plan Edit */}
                      <button
                        title="Edit Plan & Limits"
                        onClick={() => openPlanModal(user)}
                        className="btn-secondary"
                        style={{ padding: '0 0.6rem', height: '30px', fontSize: '0.75rem', color: 'var(--primary-light)' }}
                      >
                        <Zap size={12} /> Plan
                      </button>

                      {/* Moderation Actions */}
                      <button
                        title="Issue Warning"
                        onClick={() => triggerModerationConfirm(user, 'warn')}
                        className="btn-secondary"
                        style={{ padding: '0 0.55rem', height: '30px', fontSize: '0.75rem', color: 'var(--warning-text)' }}
                      >
                        Warn
                      </button>

                      {user.status === 'blocked' || user.status === 'banned' ? (
                        <button
                          title="Restore Access"
                          onClick={() => triggerModerationConfirm(user, 'unblock')}
                          className="btn-success"
                          style={{ padding: '0 0.6rem', height: '30px', fontSize: '0.75rem' }}
                        >
                          <ShieldCheck size={12} /> Restore
                        </button>
                      ) : (
                        <>
                          <button
                            title="Suspend (6h)"
                            onClick={() => triggerModerationConfirm(user, 'block')}
                            className="btn-secondary"
                            style={{ padding: '0 0.55rem', height: '30px', fontSize: '0.75rem', color: 'var(--danger-text)' }}
                          >
                            <UserX size={12} /> Suspend
                          </button>
                          <button
                            title="Ban Permanently"
                            onClick={() => triggerModerationConfirm(user, 'ban')}
                            className="btn-danger"
                            style={{ padding: '0 0.55rem', height: '30px', fontSize: '0.75rem' }}
                          >
                            <Ban size={12} /> Ban
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Plan & Limits Edit Modal */}
      {planModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(7, 10, 18, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1.5rem'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxSizing: 'border-box',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-card)',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.35rem' }}>
              <div style={{ padding: '0.4rem', borderRadius: '8px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary-light)' }}>
                <Zap size={18} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                Configure Candidate Plan & Limits
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Adjusting limits for <strong>{planModalUser.alias}</strong> (<code>{planModalUser.telegramId}</code>)
            </p>

            {/* Quick Contest Presets */}
            <div style={{
              marginBottom: '1.25rem',
              padding: '0.875rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '8px',
              border: '1px solid var(--border-card)'
            }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Contest Winner Presets
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('1st')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', height: '32px', justifyContent: 'flex-start' }}
                >
                  🥇 1st Place (60d VIP)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('2nd')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', height: '32px', justifyContent: 'flex-start' }}
                >
                  🥈 2nd Place (30d)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('3rd')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', height: '32px', justifyContent: 'flex-start' }}
                >
                  🥉 3rd Place (14d)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('vip')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', height: '32px', justifyContent: 'flex-start' }}
                >
                  🌟 Ambassador (90d)
                </button>
              </div>
            </div>

            {/* Plan Tier Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Subscription Tier
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {(['free', 'plus', 'pro', 'boss'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handlePlanTierChange(tier)}
                    style={{
                      padding: '0.55rem 0.25rem',
                      borderRadius: '6px',
                      border: planTier === tier ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                      backgroundColor: planTier === tier ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                      color: planTier === tier ? '#FFFFFF' : 'var(--text-secondary)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Validity Duration (Days) */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Validity Duration (Days)
              </label>
              <input
                type="number"
                min="1"
                max="730"
                value={durationDaysInput}
                onChange={(e) => setDurationDaysInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="Days (e.g. 30)"
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Monthly Call Limit */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Monthly Call Limit (Calls / Cycle)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input-modern num-tabular"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setDailyLimitInput(999)}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '0 0.75rem', height: '36px' }}
                >
                  Unlimited (999)
                </button>
              </div>
            </div>

            {/* Max Duration */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Max Call Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={maxDurationInput}
                onChange={(e) => setMaxDurationInput(Math.max(5, parseInt(e.target.value) || 5))}
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Custom Plan Label */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Custom Plan Label (Optional)
              </label>
              <input
                type="text"
                value={customPlanNameInput}
                onChange={(e) => setCustomPlanNameInput(e.target.value)}
                placeholder="e.g. VIP Member, Scholarship"
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Reset Calls Checkbox */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem 0.875rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '6px',
              border: '1px solid var(--border-card)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <input
                type="checkbox"
                id="resetCallsCheckbox"
                checked={resetDailyCallsCheckbox}
                onChange={(e) => setResetDailyCallsCheckbox(e.target.checked)}
                style={{ width: '15px', height: '15px', cursor: 'pointer' }}
              />
              <label htmlFor="resetCallsCheckbox" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RotateCcw size={13} style={{ color: 'var(--primary-light)' }} /> Reset monthly calls used to <strong>0</strong>
              </label>
            </div>

            {/* Modal Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={closePlanModal}
                disabled={isSubmittingPlan}
                className="btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSavePlan}
                disabled={isSubmittingPlan}
                className="btn-primary"
              >
                {isSubmittingPlan ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        affectedItem={confirmDialog.user ? `${confirmDialog.user.alias} (TG: ${confirmDialog.user.telegramId})` : undefined}
        confirmLabel={`Yes, Execute ${confirmDialog.action?.toUpperCase()}`}
        severity={confirmDialog.severity}
        isConfirming={isConfirmingAction}
        onConfirm={handleExecuteConfirmedAction}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
