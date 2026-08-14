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
  const [planTier, setPlanTier] = useState<'free' | 'plus' | 'pro'>('free');
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(3);
  const [maxDurationInput, setMaxDurationInput] = useState<number>(15);
  const [retentionOverrideInput, setRetentionOverrideInput] = useState<number | ''>('');
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
    const tier = user.planTier || 'free';
    setPlanTier(tier);
    setDailyLimitInput(user.dailyLimit ?? (tier === 'pro' ? 999 : tier === 'plus' ? 10 : 3));
    setMaxDurationInput(user.maxDuration ?? (tier === 'pro' ? 60 : tier === 'plus' ? 30 : 15));
    setRetentionOverrideInput(user.retentionOverride ? user.retentionOverride : '');
    setCustomPlanNameInput(user.customPlanName || '');
    setResetDailyCallsCheckbox(false);
  };

  const closePlanModal = () => {
    setPlanModalUser(null);
  };

  const handlePlanTierChange = (newTier: 'free' | 'plus' | 'pro') => {
    setPlanTier(newTier);
    if (newTier === 'pro') {
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
        return <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Active</span>;
      case 'warned':
        return <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#78350f', color: '#fcd34d', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Warned</span>;
      case 'blocked':
        return <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#7c2d12', color: '#fdba74', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Blocked (6h)</span>;
      case 'banned':
        return <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#451a1a', color: '#fca5a5', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>Banned</span>;
      default:
        return <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#334155', color: '#cbd5e1', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>{status}</span>;
    }
  };

  const getTierBadge = (tier: UserItem['planTier']) => {
    switch (tier) {
      case 'pro':
        return <span style={{ color: '#fbbf24', fontWeight: 600 }}>⭐ Pro</span>;
      case 'plus':
        return <span style={{ color: '#38bdf8', fontWeight: 600 }}>⚡ Plus</span>;
      default:
        return <span style={{ color: '#94a3b8' }}>Free</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            User Management & Limits
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Search user aliases or Telegram IDs, adjust subscription tiers/limits, and moderate accounts
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={isLoading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#cbd5e1',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          <RefreshCw size={16} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search alias or Telegram ID..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.625rem 0.625rem 0.625rem 2.5rem',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', backgroundColor: '#1e293b', padding: '0.25rem', borderRadius: '8px', border: '1px solid #334155' }}>
          {(['all', 'active', 'warned', 'blocked', 'banned'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '0.375rem 0.75rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: statusFilter === tab ? '#0284c7' : 'transparent',
                color: statusFilter === tab ? '#ffffff' : '#94a3b8',
                fontWeight: 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#451a1a',
          border: '1px solid #991b1b',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          color: '#fca5a5',
          fontSize: '0.875rem'
        }}>
          Error loading users: {error}
        </div>
      )}

      {/* Users Table */}
      <div style={{
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '12px',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem', color: '#f8fafc' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '0.875rem 1rem' }}>User Alias</th>
              <th style={{ padding: '0.875rem 1rem' }}>Telegram ID</th>
              <th style={{ padding: '0.875rem 1rem' }}>Plan Tier</th>
              <th style={{ padding: '0.875rem 1rem' }}>Daily Calls</th>
              <th style={{ padding: '0.875rem 1rem' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem' }}>Warnings</th>
              <th style={{ padding: '0.875rem 1rem' }}>Sub-scores</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading users list...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  No users found matching your criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{user.alias}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#94a3b8' }}>{user.telegramId}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {user.customPlanName ? (
                      <div>
                        <span style={{ color: '#c084fc', fontWeight: 600 }}>💎 {user.customPlanName}</span>
                      </div>
                    ) : (
                      getTierBadge(user.planTier)
                    )}
                    <div style={{ fontSize: '0.72rem', color: user.retentionOverride ? '#38bdf8' : '#64748b', marginTop: '0.15rem' }}>
                      {user.retentionOverride ? `Retention: ${user.retentionOverride}d (Custom)` : `Retention: ${user.planTier === 'pro' ? 30 : user.planTier === 'plus' ? 7 : 1}d`}
                    </div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{
                      color: user.dailyLimit && user.dailyLimit >= 999 ? '#34d399' : (user.dailyCallsUsed ?? 0) >= (user.dailyLimit ?? 3) ? '#f87171' : '#38bdf8',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}>
                      {user.dailyCallsUsed ?? 0} / {user.dailyLimit && user.dailyLimit >= 999 ? '∞' : (user.dailyLimit ?? 3)}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.35rem' }}>
                      ({user.maxDuration ?? (user.planTier === 'pro' ? 60 : user.planTier === 'plus' ? 30 : 15)}m)
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>{getStatusBadge(user.status)}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{ color: (user.warningCount || 0) > 0 ? '#fbbf24' : '#94a3b8', fontWeight: 500 }}>
                      {user.warningCount || 0}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {user.subscores ? (
                      <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                        FC:{user.subscores.fc} LR:{user.subscores.lr} GRA:{user.subscores.gra} P:{user.subscores.p}
                      </span>
                    ) : (
                      <span style={{ color: '#64748b' }}>N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      {/* Edit Plan & Limits Button */}
                      <button
                        title="Manage Plan & Limits"
                        onClick={() => openPlanModal(user)}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#0284c720',
                          border: '1px solid #0284c760',
                          color: '#38bdf8',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        <Zap size={14} /> Plan / Limits
                      </button>

                      <button
                        title="Issue Warning"
                        onClick={() => openModerationModal(user, 'warn')}
                        style={{
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#78350f30',
                          border: '1px solid #78350f60',
                          color: '#fcd34d',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 500
                        }}
                      >
                        <AlertTriangle size={14} /> Warn
                      </button>

                      {user.status === 'blocked' || user.status === 'banned' ? (
                        <button
                          title="Unblock Access"
                          onClick={() => openModerationModal(user, 'unblock')}
                          style={{
                            padding: '0.35rem 0.6rem',
                            backgroundColor: '#064e3b30',
                            border: '1px solid #064e3b60',
                            color: '#6ee7b7',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 500
                          }}
                        >
                          <ShieldCheck size={14} /> Unblock
                        </button>
                      ) : (
                        <>
                          <button
                            title="Block User (6h)"
                            onClick={() => openModerationModal(user, 'block')}
                            style={{
                              padding: '0.35rem 0.6rem',
                              backgroundColor: '#7c2d1230',
                              border: '1px solid #7c2d1260',
                              color: '#fdba74',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500
                            }}
                          >
                            <UserX size={14} /> Block
                          </button>
                          <button
                            title="Ban User Permanently"
                            onClick={() => openModerationModal(user, 'ban')}
                            style={{
                              padding: '0.35rem 0.6rem',
                              backgroundColor: '#451a1a',
                              border: '1px solid #991b1b',
                              color: '#fca5a5',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500
                            }}
                          >
                            <Ban size={14} /> Ban
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
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '480px',
            padding: '1.75rem',
            color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Zap size={20} style={{ color: '#38bdf8' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                Adjust Plan & Limits
              </h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.25rem 0' }}>
              Manually upgrade/downgrade plan or customize limits for{' '}
              <strong style={{ color: '#f8fafc' }}>{planModalUser.alias}</strong> (ID: {planModalUser.telegramId})
            </p>

            {/* Plan Tier Selector */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem', fontWeight: 600 }}>
                Subscription Tier
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {(['free', 'plus', 'pro'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handlePlanTierChange(tier)}
                    style={{
                      padding: '0.625rem',
                      borderRadius: '8px',
                      border: planTier === tier ? '2px solid #0284c7' : '1px solid #334155',
                      backgroundColor: planTier === tier ? '#0284c725' : '#0f172a',
                      color: planTier === tier ? '#38bdf8' : '#94a3b8',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      fontSize: '0.85rem'
                    }}
                  >
                    {tier === 'pro' ? '⭐ PRO' : tier === 'plus' ? '⚡ PLUS' : '🆓 FREE'}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Call Limit */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                Daily Call Limit (Calls / Day)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="number"
                  min="1"
                  max="999"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '0.9rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setDailyLimitInput(999)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: dailyLimitInput >= 999 ? '#059669' : '#334155',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Set Unlimited (999)
                </button>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                999 represents unlimited daily calls.
              </span>
            </div>

            {/* Max Call Duration */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                Max Call Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={maxDurationInput}
                onChange={(e) => setMaxDurationInput(Math.max(5, parseInt(e.target.value) || 5))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Custom Plan Label */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                Custom Plan Label (Optional)
              </label>
              <input
                type="text"
                value={customPlanNameInput}
                onChange={(e) => setCustomPlanNameInput(e.target.value)}
                placeholder="e.g. VIP Member, Scholarship, Partner"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Custom Recording Retention Override */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                Recording Retention Override (Days)
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {[
                  { label: 'Plan Default', val: '' },
                  { label: '1 day', val: 1 },
                  { label: '7 days', val: 7 },
                  { label: '14 days', val: 14 },
                  { label: '30 days', val: 30 },
                  { label: '90 days', val: 90 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setRetentionOverrideInput(opt.val as any)}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: '6px',
                      border: retentionOverrideInput === opt.val ? '2px solid #0284c7' : '1px solid #334155',
                      backgroundColor: retentionOverrideInput === opt.val ? '#0284c725' : '#0f172a',
                      color: retentionOverrideInput === opt.val ? '#38bdf8' : '#94a3b8',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                max="365"
                placeholder="Custom retention days (e.g. 60)"
                value={retentionOverrideInput}
                onChange={(e) => setRetentionOverrideInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
            </div>

            {/* Reset Calls Today Checkbox */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem',
              backgroundColor: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #334155',
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
              <label htmlFor="resetCallsCheckbox" style={{ fontSize: '0.85rem', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <RotateCcw size={14} style={{ color: '#38bdf8' }} /> Reset calls used today to <strong>0</strong>
              </label>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={closePlanModal}
                disabled={isSubmittingPlan}
                style={{
                  padding: '0.625rem 1rem',
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSavePlan}
                disabled={isSubmittingPlan}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: isSubmittingPlan ? 'not-allowed' : 'pointer'
                }}
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
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '450px',
            padding: '1.75rem',
            color: '#f8fafc'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
              Confirm Moderation Action
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1.25rem 0' }}>
              Are you sure you want to <strong>{pendingAction.toUpperCase()}</strong> user{' '}
              <span style={{ color: '#f8fafc' }}>{selectedUser.alias}</span> (Telegram ID: {selectedUser.telegramId})?
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem', fontWeight: 500 }}>
                Moderation Reason / Internal Note (Optional)
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Enter reason for audit log..."
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '0.625rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.875rem',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={closeModerationModal}
                disabled={isSubmittingAction}
                style={{
                  padding: '0.625rem 1rem',
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteModeration}
                disabled={isSubmittingAction}
                style={{
                  padding: '0.625rem 1.25rem',
                  backgroundColor: pendingAction === 'ban' ? '#dc2626' : pendingAction === 'block' ? '#ea580c' : '#0284c7',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontWeight: 600,
                  cursor: isSubmittingAction ? 'not-allowed' : 'pointer'
                }}
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
