import { useState, useEffect, useCallback } from 'react';
import type { UserItem, ModerationAction } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Search, AlertTriangle, Ban, ShieldCheck, RefreshCw, UserX, Zap, RotateCcw } from 'lucide-react';

export function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warned' | 'blocked' | 'banned'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [pendingAction, setPendingAction] = useState<ModerationAction | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

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
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch user list.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(timeout);
  }, [fetchUsers]);

  const openModerationModal = (user: UserItem, action: ModerationAction) => {
    setSelectedUser(user);
    setPendingAction(action);
    setActionReason('');
  };

  const closeModerationModal = () => {
    setSelectedUser(null);
    setPendingAction(null);
    setActionReason('');
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
      setCustomPlanNameInput('🥇 Contest 1st Place (VIP)');
      setDailyLimitInput(50);
      setMaxDurationInput(90);
      setRecordingLimitInput(15);
      setRetentionOverrideInput(90);
      setDurationDaysInput(60);
      setResetDailyCallsCheckbox(true);
    } else if (preset === '2nd') {
      setPlanTier('pro');
      setCustomPlanNameInput('🥈 Contest 2nd Place');
      setDailyLimitInput(25);
      setMaxDurationInput(60);
      setRecordingLimitInput(7);
      setRetentionOverrideInput(30);
      setDurationDaysInput(30);
      setResetDailyCallsCheckbox(true);
    } else if (preset === '3rd') {
      setPlanTier('plus');
      setCustomPlanNameInput('🥉 Contest 3rd Place');
      setDailyLimitInput(15);
      setMaxDurationInput(30);
      setRecordingLimitInput(5);
      setRetentionOverrideInput(14);
      setDurationDaysInput(14);
      setResetDailyCallsCheckbox(true);
    } else if (preset === 'vip') {
      setPlanTier('boss');
      setCustomPlanNameInput('🌟 PairTalk Ambassador');
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

  const handleExecuteModeration = async () => {
    if (!selectedUser || !pendingAction) return;

    setIsSubmittingAction(true);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${selectedUser.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          action: pendingAction,
          reason: actionReason.trim() || undefined,
        }),
      });

      // Update local users array
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser } : u))
      );

      closeModerationModal();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Moderation action failed: ${err.message}`);
      } else {
        alert('Moderation action failed.');
      }
    } finally {
      setIsSubmittingAction(false);
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
      if (err instanceof Error) {
        alert(`Failed to update plan: ${err.message}`);
      } else {
        alert('Failed to update user plan.');
      }
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const getStatusBadge = (status: UserItem['status']) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-success">● Active</span>;
      case 'warned':
        return <span className="badge badge-warning">● Warned</span>;
      case 'blocked':
        return <span className="badge badge-danger">● Blocked</span>;
      case 'banned':
        return <span className="badge badge-danger">● Banned</span>;
      default:
        return <span className="badge badge-neutral">● {status}</span>;
    }
  };

  const getTierBadge = (user: UserItem) => {
    if (user.customPlanName) {
      return (
        <span className="badge badge-gold" style={{ fontSize: '0.725rem' }}>
          👑 {user.customPlanName}
        </span>
      );
    }
    switch (user.planTier) {
      case 'boss':
        return <span className="badge badge-gold">👑 BOSS</span>;
      case 'pro':
        return <span className="badge badge-warning">⭐ PRO</span>;
      case 'plus':
        return <span className="badge badge-info">⚡ PLUS</span>;
      default:
        return <span className="badge badge-neutral">FREE</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            User Management & Plan Maker
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Search candidates, assign custom duration/limits, award contest prizes, and moderate accounts
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={isLoading}
          className="btn-secondary"
          style={{ padding: '0.5rem 0.875rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '280px', maxWidth: '460px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alias or Telegram ID..."
            className="input-modern"
            style={{ width: '100%', paddingLeft: '2.5rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-surface-elevated)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
          {(['all', 'active', 'warned', 'blocked', 'banned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: statusFilter === tab ? 'var(--primary)' : 'transparent',
                color: statusFilter === tab ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
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
            backgroundColor: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: '10px',
            padding: '0.875rem 1.25rem',
            color: '#fca5a5',
            fontSize: '0.875rem',
          }}
        >
          Error loading candidates: {error}
        </div>
      )}

      {/* Users Table Container */}
      <div className="table-container">
        <table className="table-modern">
          <thead>
            <tr>
              <th>User Alias</th>
              <th>Telegram ID</th>
              <th>Plan Tier & Retention</th>
              <th>Calls Used / Limit</th>
              <th>Status</th>
              <th>Warnings</th>
              <th>Sub-scores</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Loading candidates roster...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No candidates found matching your criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.alias}</td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    <code>{user.telegramId}</code>
                  </td>
                  <td>
                    {getTierBadge(user)}
                    <div style={{ fontSize: '0.725rem', color: user.retentionOverride ? '#38bdf8' : 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {user.retentionOverride ? `Retention: ${user.retentionOverride}d (Custom)` : `Retention: ${user.planTier === 'pro' ? 30 : user.planTier === 'plus' ? 7 : 1}d`}
                    </div>
                  </td>
                  <td>
                    <span className="num-tabular" style={{
                      color: user.dailyLimit && user.dailyLimit >= 999 ? '#34d399' : (user.dailyCallsUsed ?? 0) >= (user.dailyLimit ?? 3) ? '#fb7185' : '#38bdf8',
                      fontWeight: 700,
                      fontSize: '0.875rem'
                    }}>
                      {user.dailyCallsUsed ?? 0} / {user.dailyLimit && user.dailyLimit >= 999 ? '∞' : (user.dailyLimit ?? 3)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                      ({user.maxDuration ?? (user.planTier === 'pro' ? 60 : user.planTier === 'plus' ? 30 : 15)}m)
                    </span>
                  </td>
                  <td>{getStatusBadge(user.status)}</td>
                  <td>
                    <span style={{ color: (user.warningCount || 0) > 0 ? '#fbbf24' : 'var(--text-muted)', fontWeight: 600 }}>
                      {user.warningCount || 0}
                    </span>
                  </td>
                  <td>
                    {user.subscores ? (
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        FC:{user.subscores.fc} LR:{user.subscores.lr} GRA:{user.subscores.gra} P:{user.subscores.p}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>N/A</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                      {/* Edit Plan & Limits Button */}
                      <button
                        title="Manage Plan & Limits"
                        onClick={() => openPlanModal(user)}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary-light)', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                      >
                        <Zap size={13} /> Plan / Limits
                      </button>

                      <button
                        title="Issue Warning"
                        onClick={() => openModerationModal(user, 'warn')}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: '#fcd34d' }}
                      >
                        <AlertTriangle size={13} /> Warn
                      </button>

                      {user.status === 'blocked' || user.status === 'banned' ? (
                        <button
                          title="Unblock Access"
                          onClick={() => openModerationModal(user, 'unblock')}
                          className="btn-success"
                          style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                        >
                          <ShieldCheck size={13} /> Unblock
                        </button>
                      ) : (
                        <>
                          <button
                            title="Block User (6h)"
                            onClick={() => openModerationModal(user, 'block')}
                            className="btn-secondary"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', color: '#fdba74' }}
                          >
                            <UserX size={13} /> Block
                          </button>
                          <button
                            title="Ban User Permanently"
                            onClick={() => openModerationModal(user, 'ban')}
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
                          >
                            <Ban size={13} /> Ban
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Plan & Limits Edit Modal */}
      {planModalUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(9, 13, 22, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1.5rem'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: 'min(500px, 95vw)',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <div style={{ padding: '0.4rem', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary-light)' }}>
                <Zap size={20} />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Custom Plan & Limits Maker
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem 0' }}>
              Configure custom limits, duration, or grant contest prizes for <strong style={{ color: 'var(--text-primary)' }}>{planModalUser.alias}</strong> (<code>{planModalUser.telegramId}</code>)
            </p>

            {/* Quick Contest / Winner Presets */}
            <div style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              backgroundColor: 'rgba(251, 191, 36, 0.06)',
              borderRadius: '10px',
              border: '1px solid rgba(251, 191, 36, 0.25)'
            }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#fde047', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                🏆 Quick Contest Winner Presets
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('1st')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', justifyContent: 'flex-start', borderColor: 'rgba(251, 191, 36, 0.3)', color: '#fde047' }}
                >
                  🥇 1st Place (60d VIP)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('2nd')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                >
                  🥈 2nd Place (30d)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('3rd')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                >
                  🥉 3rd Place (14d)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyContestPreset('vip')}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', justifyContent: 'flex-start', color: '#38bdf8', borderColor: 'rgba(6, 182, 212, 0.3)' }}
                >
                  🌟 Ambassador (90d)
                </button>
              </div>
            </div>

            {/* Plan Tier Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Base Subscription Tier
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {(['free', 'plus', 'pro', 'boss'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handlePlanTierChange(tier)}
                    style={{
                      padding: '0.625rem 0.25rem',
                      borderRadius: '8px',
                      border: planTier === tier ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                      backgroundColor: planTier === tier ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-surface-elevated)',
                      color: planTier === tier ? '#ffffff' : 'var(--text-secondary)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tier === 'boss' ? '👑 BOSS' : tier === 'pro' ? '⭐ PRO' : tier === 'plus' ? '⚡ PLUS' : 'FREE'}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan Validity Length (Days) */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Plan Validity Duration (Days from Now)
              </label>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationDaysInput(d)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      border: durationDaysInput === d ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                      backgroundColor: durationDaysInput === d ? 'rgba(99, 102, 241, 0.2)' : 'var(--bg-surface-elevated)',
                      color: durationDaysInput === d ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="730"
                value={durationDaysInput}
                onChange={(e) => setDurationDaysInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="Custom days (e.g. 45)"
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Monthly Call Limit */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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
                  style={{ fontSize: '0.8rem', padding: '0.5rem 0.875rem' }}
                >
                  Set Unlimited (999)
                </button>
              </div>
            </div>

            {/* Max Call Duration */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

            {/* Recording Credits Limit */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Recording Credits Limit (Optional Override)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={recordingLimitInput}
                onChange={(e) => setRecordingLimitInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                placeholder="Tier default if empty (e.g. 15)"
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Custom Plan Label */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Custom Plan Title Label (Optional)
              </label>
              <input
                type="text"
                value={customPlanNameInput}
                onChange={(e) => setCustomPlanNameInput(e.target.value)}
                placeholder="e.g. VIP Member, Scholarship, Contest Champion"
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Custom Recording Retention Override */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Recording Retention Override (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                placeholder="Custom retention days (e.g. 60)"
                value={retentionOverrideInput}
                onChange={(e) => setRetentionOverrideInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                className="input-modern num-tabular"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {/* Reset Calls Today Checkbox */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.875rem',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '8px',
              border: '1px solid var(--border-card)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem'
            }}>
              <input
                type="checkbox"
                id="resetCallsCheckbox"
                checked={resetDailyCallsCheckbox}
                onChange={(e) => setResetDailyCallsCheckbox(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="resetCallsCheckbox" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <RotateCcw size={14} style={{ color: 'var(--primary-light)' }} /> Reset call & recording usage for this cycle to <strong>0</strong>
              </label>
            </div>

            {/* Action Buttons */}
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
                {isSubmittingPlan ? 'Saving Changes...' : 'Save Plan & Limits'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Confirmation Modal */}
      {selectedUser && pendingAction && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(9, 13, 22, 0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1.5rem'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: 'min(460px, 95vw)',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2rem',
            boxSizing: 'border-box',
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
              Confirm Moderation Action
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Are you sure you want to <strong style={{ color: 'var(--text-primary)' }}>{pendingAction.toUpperCase()}</strong> candidate{' '}
              <span style={{ color: '#f8fafc' }}>{selectedUser.alias}</span> (<code>{selectedUser.telegramId}</code>)?
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                Moderation Reason / Internal Note (Optional)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter infraction reason for audit record..."
                rows={3}
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={closeModerationModal}
                disabled={isSubmittingAction}
                className="btn-secondary"
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteModeration}
                disabled={isSubmittingAction}
                className={pendingAction === 'ban' ? 'btn-danger' : pendingAction === 'block' ? 'btn-secondary' : 'btn-primary'}
                style={pendingAction === 'block' ? { color: '#fdba74', borderColor: 'rgba(251, 146, 60, 0.4)' } : undefined}
              >
                {isSubmittingAction ? 'Applying...' : `Confirm ${pendingAction.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
