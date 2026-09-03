import { useState, useEffect, useCallback, useMemo } from 'react';
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
  User,
  Sliders,
  ShieldAlert,
  X,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';


type ControlPanelTab = 'limits' | 'plan' | 'status';

export function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'warned' | 'blocked' | 'banned'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dedicated Active Candidate Drawer / Panel State
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [activePanelTab, setActivePanelTab] = useState<ControlPanelTab>('limits');

  // Limits Panel State
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(3);
  const [maxDurationInput, setMaxDurationInput] = useState<number>(15);
  const [retentionOverrideInput, setRetentionOverrideInput] = useState<number | ''>('');
  const [recordingLimitInput, setRecordingLimitInput] = useState<number | ''>('');
  const [isResettingCalls, setIsResettingCalls] = useState<boolean>(false);
  const [isSavingLimits, setIsSavingLimits] = useState<boolean>(false);

  // Plan Panel State
  const [planTier, setPlanTier] = useState<'free' | 'plus' | 'pro' | 'boss'>('free');
  const [durationDaysInput, setDurationDaysInput] = useState<number | ''>(30);
  const [customPlanNameInput, setCustomPlanNameInput] = useState<string>('');
  const [resetCallsOnPlanChange, setResetCallsOnPlanChange] = useState<boolean>(false);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState<boolean>(false);

  // Status / Moderation State
  const [suspensionDuration, setSuspensionDuration] = useState<string>('6h');
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

  // Open Dedicated Candidate Drawer to specific tab
  const openCandidatePanel = (user: UserItem, tab: ControlPanelTab = 'limits') => {
    setSelectedUser(user);
    setActivePanelTab(tab);
    setFeedback(null);

    // Initialize Limits fields
    const rawTier = (user.planTier || 'free').toLowerCase();
    const tier: 'free' | 'plus' | 'pro' | 'boss' =
      rawTier === 'boss' ? 'boss' : rawTier === 'pro' ? 'pro' : rawTier === 'plus' ? 'plus' : 'free';
    setPlanTier(tier);
    setDailyLimitInput(user.dailyLimit ?? (tier === 'boss' || tier === 'pro' ? 999 : tier === 'plus' ? 10 : 3));
    setMaxDurationInput(user.maxDuration ?? (tier === 'boss' || tier === 'pro' ? 60 : tier === 'plus' ? 30 : 15));
    setRetentionOverrideInput(user.retentionOverride ? user.retentionOverride : '');
    setRecordingLimitInput(user.recordingLimitOverride ? user.recordingLimitOverride : '');

    // Initialize Plan fields
    setDurationDaysInput(30);
    setCustomPlanNameInput(user.customPlanName || '');
    setResetCallsOnPlanChange(false);
  };

  const closeCandidatePanel = () => {
    setSelectedUser(null);
  };

  // Save Limits Form
  const handleSaveLimits = async () => {
    if (!selectedUser) return;
    setIsSavingLimits(true);
    setFeedback(null);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${selectedUser.id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: selectedUser.planTier.toUpperCase(),
          dailyLimit: Number(dailyLimitInput),
          maxDuration: Number(maxDurationInput),
          retentionOverride: retentionOverrideInput !== '' ? Number(retentionOverrideInput) : null,
          recordingLimit: recordingLimitInput !== '' ? Number(recordingLimitInput) : null,
        }),
      });

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
      setFeedback({ type: 'success', message: 'Speaking limits updated successfully!' });
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update limits.' });
    } finally {
      setIsSavingLimits(false);
    }
  };

  // Instant Reset Monthly Calls to 0
  const handleResetMonthlyCalls = async () => {
    if (!selectedUser) return;
    setIsResettingCalls(true);
    setFeedback(null);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${selectedUser.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset-calls',
          reason: 'Manual cycle reset via Admin Limits Panel',
        }),
      });

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser, dailyCallsUsed: 0 } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, ...updatedUser, dailyCallsUsed: 0 } : null));
      setFeedback({ type: 'success', message: 'Monthly calls counter reset to 0.' });
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to reset call count.' });
    } finally {
      setIsResettingCalls(false);
    }
  };

  // Apply Contest Winner Presets in Plan Panel
  const handleApplyContestPreset = (preset: '1st' | '2nd' | '3rd' | 'vip') => {
    if (preset === '1st') {
      setPlanTier('boss');
      setCustomPlanNameInput('Contest 1st Place (VIP)');
      setDailyLimitInput(50);
      setMaxDurationInput(90);
      setRecordingLimitInput(15);
      setRetentionOverrideInput(90);
      setDurationDaysInput(60);
      setResetCallsOnPlanChange(true);
    } else if (preset === '2nd') {
      setPlanTier('pro');
      setCustomPlanNameInput('Contest 2nd Place');
      setDailyLimitInput(25);
      setMaxDurationInput(60);
      setRecordingLimitInput(7);
      setRetentionOverrideInput(30);
      setDurationDaysInput(30);
      setResetCallsOnPlanChange(true);
    } else if (preset === '3rd') {
      setPlanTier('plus');
      setCustomPlanNameInput('Contest 3rd Place');
      setDailyLimitInput(15);
      setMaxDurationInput(30);
      setRecordingLimitInput(5);
      setRetentionOverrideInput(14);
      setDurationDaysInput(14);
      setResetCallsOnPlanChange(true);
    } else if (preset === 'vip') {
      setPlanTier('boss');
      setCustomPlanNameInput('PairTalk Ambassador');
      setDailyLimitInput(999);
      setMaxDurationInput(90);
      setRecordingLimitInput(20);
      setRetentionOverrideInput(90);
      setDurationDaysInput(90);
      setResetCallsOnPlanChange(true);
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

  // Save Plan Assignment
  const handleSavePlan = async () => {
    if (!selectedUser) return;
    setIsSubmittingPlan(true);
    setFeedback(null);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${selectedUser.id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: planTier.toUpperCase(),
          dailyLimit: Number(dailyLimitInput),
          maxDuration: Number(maxDurationInput),
          retentionOverride: retentionOverrideInput !== '' ? Number(retentionOverrideInput) : null,
          recordingLimit: recordingLimitInput !== '' ? Number(recordingLimitInput) : null,
          durationDays: durationDaysInput !== '' ? Number(durationDaysInput) : 30,
          customPlanName: customPlanNameInput.trim() || null,
          resetDailyCalls: resetCallsOnPlanChange,
        }),
      });

      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, ...updatedUser } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
      setFeedback({ type: 'success', message: `Plan upgraded to ${planTier.toUpperCase()} successfully!` });
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update plan assignment.' });
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // Moderation Confirm Trigger
  const triggerModerationConfirm = (user: UserItem, action: ModerationAction) => {
    let title = '';
    let message = '';
    let severity: 'danger' | 'warning' | 'info' = 'danger';

    if (action === 'ban') {
      title = 'Permanently Ban Candidate';
      message = `This will permanently revoke platform access for ${user.alias} (TG: ${user.telegramId}). They can only regain access via an unban appeal.`;
      severity = 'danger';
    } else if (action === 'block') {
      title = `Suspend Candidate (${suspensionDuration.toUpperCase()})`;
      message = `This will temporarily suspend ${user.alias} for ${suspensionDuration}. Access will automatically restore afterwards.`;
      severity = 'warning';
    } else if (action === 'warn') {
      title = 'Issue Formal Violation Warning';
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
    setFeedback(null);
    try {
      const updatedUser = await adminFetch<UserItem>(`/api/admin/users/${user.id}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          reason: `Administrative action (${suspensionDuration}) via Operations Console`,
        }),
      });

      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updatedUser } : u)));
      setSelectedUser((prev) => (prev ? { ...prev, ...updatedUser } : null));
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      setFeedback({ type: 'success', message: `Executed ${action.toUpperCase()} action successfully.` });
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Moderation action failed.' });
    } finally {
      setIsConfirmingAction(false);
    }
  };

  // Compute overall band score using strict whole-band IELTS scoring (5, 6, 7, 8, 9)
  const getOverallBand = (user: UserItem) => {
    if (user.subscores?.band !== undefined && user.subscores?.band !== null) {
      const b = Number(user.subscores.band);
      return Math.max(5, Math.min(9, Math.round(b))).toString();
    }
    if (!user.subscores) return null;
    const { fc, lr, gra, p } = user.subscores;
    const avg = (fc + lr + gra + p) / 4;
    const rounded = Math.max(5, Math.min(9, Math.round(avg)));
    return rounded.toString();
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

  const liveExpiryDate = useMemo(() => {
    const days = Number(durationDaysInput) || 30;
    const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return d.toISOString().substring(0, 10);
  }, [durationDaysInput]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Candidate Roster"
        description="Streamlined learner registry with deep controls organized into dedicated Limits, Plan, and Status panels"
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
        {/* Search Input */}
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
                fontWeight: statusFilter === tab ? 700 : 500,
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

      {feedback && !selectedUser && (
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

      {/* R6: STREAMLINED 4-COLUMN MAIN CANDIDATE TABLE */}
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
                <th style={{ width: '25%' }}>Alias</th>
                <th style={{ width: '20%' }}>Telegram ID</th>
                <th style={{ width: '20%' }}>Plan</th>
                <th style={{ width: '35%' }}>IELTS Band Scores</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const overallBand = getOverallBand(user);

                return (
                  <tr
                    key={user.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openCandidatePanel(user, 'limits')}
                  >
                    {/* Column 1: Alias */}
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.9rem' }}>{user.alias}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(user.alias, `alias-${user.id}`);
                            }}
                            title="Copy alias"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                          >
                            {copiedId === `alias-${user.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                          </button>
                        </div>

                        {/* Quick Status Dot */}
                        {user.status !== 'active' && (
                          <span style={{ fontSize: '0.7rem' }}>
                            {getStatusBadgeComponent(user.status)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Telegram ID */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ color: 'var(--text-primary)', fontSize: '0.825rem', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                          {user.telegramId}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(user.telegramId.toString(), `tg-${user.id}`);
                          }}
                          title="Copy Telegram ID"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                        >
                          {copiedId === `tg-${user.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>

                    {/* Column 3: Plan */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {getTierBadgeComponent(user)}
                        <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          ({user.dailyCallsUsed ?? 0}/{user.dailyLimit && user.dailyLimit >= 999 ? '∞' : (user.dailyLimit ?? 3)})
                        </span>
                      </div>
                    </td>

                    {/* Column 4: IELTS Band Scores */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {overallBand ? (
                            <span className="badge badge-gold num-tabular" style={{ fontWeight: 800, fontSize: '0.75rem' }}>
                              Band {overallBand}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Unassessed</span>
                          )}

                          {user.subscores ? (
                            <span className="badge badge-neutral num-tabular" style={{ fontSize: '0.7rem' }}>
                              FC:{user.subscores.fc} LR:{user.subscores.lr} GRA:{user.subscores.gra} P:{user.subscores.p}
                            </span>
                          ) : null}
                        </div>

                        {/* Direct Panel Action Triggers */}
                        <div style={{ display: 'inline-flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            title="Speaking Limits Panel"
                            onClick={() => openCandidatePanel(user, 'limits')}
                            className="btn-secondary"
                            style={{
                              height: '28px',
                              padding: '0 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              backgroundColor: 'rgba(6, 182, 212, 0.15)',
                              borderColor: 'rgba(6, 182, 212, 0.4)',
                              color: '#38BDF8',
                              cursor: 'pointer',
                            }}
                          >
                            <Sliders size={12} /> Limits
                          </button>
                          <button
                            title="Subscription Plan Panel"
                            onClick={() => openCandidatePanel(user, 'plan')}
                            className="btn-secondary"
                            style={{
                              height: '28px',
                              padding: '0 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              backgroundColor: 'rgba(168, 85, 247, 0.15)',
                              borderColor: 'rgba(168, 85, 247, 0.4)',
                              color: '#C084FC',
                              cursor: 'pointer',
                            }}
                          >
                            <Zap size={12} /> Plan
                          </button>
                          <button
                            title="Moderation Status Panel"
                            onClick={() => openCandidatePanel(user, 'status')}
                            className="btn-secondary"
                            style={{ height: '26px', padding: '0 0.5rem', fontSize: '0.725rem', fontWeight: 600, color: user.status === 'active' ? 'var(--text-secondary)' : 'var(--danger-text)' }}
                          >
                            <ShieldAlert size={11} /> Status
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DEDICATED 3-PANEL CANDIDATE MODAL / DRAWER */}
      {selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(7, 10, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1.5rem',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '1.75rem',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ padding: '0.35rem', borderRadius: '6px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary-light)' }}>
                    <User size={18} />
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {selectedUser.alias}
                  </h3>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Telegram ID: <code style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{selectedUser.telegramId}</code>
                </div>
              </div>

              <button
                onClick={closeCandidatePanel}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close panel"
              >
                <X size={18} />
              </button>
            </div>

            {/* 3 Dedicated Control Tabs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.35rem',
                backgroundColor: 'var(--bg-surface-elevated)',
                padding: '0.25rem',
                borderRadius: '8px',
                border: '1px solid var(--border-card)',
                marginBottom: '1.5rem',
              }}
            >
              <button
                type="button"
                onClick={() => setActivePanelTab('limits')}
                style={{
                  padding: '0.5rem 0.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: activePanelTab === 'limits' ? 'var(--primary-bg)' : 'transparent',
                  color: activePanelTab === 'limits' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activePanelTab === 'limits' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.12s ease',
                }}
              >
                <Sliders size={13} /> Limits Panel
              </button>

              <button
                type="button"
                onClick={() => setActivePanelTab('plan')}
                style={{
                  padding: '0.5rem 0.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: activePanelTab === 'plan' ? 'var(--primary-bg)' : 'transparent',
                  color: activePanelTab === 'plan' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activePanelTab === 'plan' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.12s ease',
                }}
              >
                <Zap size={13} /> Plan Panel
              </button>

              <button
                type="button"
                onClick={() => setActivePanelTab('status')}
                style={{
                  padding: '0.5rem 0.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: activePanelTab === 'status' ? 'var(--primary-bg)' : 'transparent',
                  color: activePanelTab === 'status' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activePanelTab === 'status' ? 700 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.12s ease',
                }}
              >
                <ShieldAlert size={13} /> Status Panel
              </button>
            </div>

            {feedback && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: feedback.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
                  border: feedback.type === 'success' ? '1px solid var(--success-border)' : '1px solid var(--danger-border)',
                  color: feedback.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem',
                  marginBottom: '1.25rem',
                }}
              >
                {feedback.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>{feedback.message}</span>
              </div>
            )}

            {/* PANEL 1: LIMITS PANEL */}
            {activePanelTab === 'limits' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Current Cycle Usage Card */}
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-card)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.03em' }}>
                      Current Cycle Speaking Usage
                    </span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '0.25rem' }}>
                      <span className="num-tabular" style={{ fontSize: '1.5rem', fontWeight: 800, color: (selectedUser.dailyCallsUsed ?? 0) >= (selectedUser.dailyLimit ?? 3) ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                        {selectedUser.dailyCallsUsed ?? 0}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        / {selectedUser.dailyLimit && selectedUser.dailyLimit >= 999 ? '∞ Unlimited' : `${selectedUser.dailyLimit ?? 3} calls`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleResetMonthlyCalls}
                    disabled={isResettingCalls}
                    className="btn-secondary"
                    style={{ fontSize: '0.75rem', height: '32px' }}
                  >
                    <RotateCcw size={13} style={{ animation: isResettingCalls ? 'spin 1s linear infinite' : 'none' }} />
                    Reset to 0
                  </button>
                </div>

                {/* Monthly Call Allowance Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Call Allowance (Monthly Calls Limit)
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

                {/* Max Call Duration */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
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

                {/* Recording Limits Override & Audio Retention */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Recording Limit Override
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      placeholder="Default"
                      value={recordingLimitInput}
                      onChange={(e) => setRecordingLimitInput(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                      className="input-modern num-tabular"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 700, textTransform: 'uppercase' }}>
                      Audio Retention (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Default"
                      value={retentionOverrideInput}
                      onChange={(e) => setRetentionOverrideInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                      className="input-modern num-tabular"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button type="button" onClick={closeCandidatePanel} className="btn-secondary">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveLimits}
                    disabled={isSavingLimits}
                    className="btn-primary"
                  >
                    <Save size={14} /> {isSavingLimits ? 'Saving...' : 'Save Limits'}
                  </button>
                </div>
              </div>
            )}

            {/* PANEL 2: PLAN PANEL */}
            {activePanelTab === 'plan' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Target Tier Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Target Subscription Tier
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                    {(['free', 'plus', 'pro', 'boss'] as const).map((tier) => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => handlePlanTierChange(tier)}
                        style={{
                          padding: '0.6rem 0.25rem',
                          borderRadius: '6px',
                          border: planTier === tier ? '2px solid var(--primary)' : '1px solid var(--border-card)',
                          backgroundColor: planTier === tier ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                          color: planTier === tier ? '#FFFFFF' : 'var(--text-secondary)',
                          fontWeight: 700,
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

                {/* Validity Duration & Live Expiry Preview */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      Validity Duration (Days)
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)', fontWeight: 600 }}>
                      Live Expiry: {liveExpiryDate}
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="730"
                    value={durationDaysInput}
                    onChange={(e) => setDurationDaysInput(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                    placeholder="Duration days (e.g. 30)"
                    className="input-modern num-tabular"
                    style={{ width: '100%', boxSizing: 'border-box', marginBottom: '0.4rem' }}
                  />
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {[
                      { label: '30 Days (1 Mo)', days: 30 },
                      { label: '60 Days (2 Mo)', days: 60 },
                      { label: '90 Days (3 Mo)', days: 90 },
                      { label: '365 Days (1 Yr)', days: 365 },
                    ].map((preset) => (
                      <button
                        key={preset.days}
                        type="button"
                        onClick={() => setDurationDaysInput(preset.days)}
                        className="btn-secondary"
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          height: '24px',
                          backgroundColor: Number(durationDaysInput) === preset.days ? 'var(--primary-bg)' : undefined,
                          borderColor: Number(durationDaysInput) === preset.days ? 'var(--primary)' : undefined,
                          color: Number(durationDaysInput) === preset.days ? '#fff' : undefined,
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Plan Label */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Custom Plan Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={customPlanNameInput}
                    onChange={(e) => setCustomPlanNameInput(e.target.value)}
                    placeholder="e.g. Contest 1st Place, VIP Scholarship"
                    className="input-modern"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Contest Winner Presets (Zero Emojis) */}
                <div style={{ padding: '0.875rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
                  <span style={{ display: 'block', fontSize: '0.725rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Contest Winner Presets:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => handleApplyContestPreset('1st')}
                      className="btn-secondary"
                      style={{ fontSize: '0.725rem', height: '30px', justifyContent: 'flex-start' }}
                    >
                      1st Place (60d VIP)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyContestPreset('2nd')}
                      className="btn-secondary"
                      style={{ fontSize: '0.725rem', height: '30px', justifyContent: 'flex-start' }}
                    >
                      2nd Place (30d BOSS)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyContestPreset('3rd')}
                      className="btn-secondary"
                      style={{ fontSize: '0.725rem', height: '30px', justifyContent: 'flex-start' }}
                    >
                      3rd Place (14d PRO)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyContestPreset('vip')}
                      className="btn-secondary"
                      style={{ fontSize: '0.725rem', height: '30px', justifyContent: 'flex-start' }}
                    >
                      Ambassador (90d BOSS)
                    </button>
                  </div>
                </div>

                {/* Reset Daily Calls Checkbox */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="resetCallsCheckbox"
                    checked={resetCallsOnPlanChange}
                    onChange={(e) => setResetCallsOnPlanChange(e.target.checked)}
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                  <label htmlFor="resetCallsCheckbox" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Reset current monthly calls used to <strong>0</strong> upon grant
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button type="button" onClick={closeCandidatePanel} className="btn-secondary">
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePlan}
                    disabled={isSubmittingPlan}
                    className="btn-primary"
                  >
                    <Zap size={14} /> {isSubmittingPlan ? 'Assigning...' : 'Assign Entitlements'}
                  </button>
                </div>
              </div>
            )}

            {/* PANEL 3: STATUS & MODERATION PANEL */}
            {activePanelTab === 'status' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Current Standing Summary */}
                <div
                  style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-card)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Current Platform Standing
                    </span>
                    <div style={{ marginTop: '0.35rem' }}>
                      {getStatusBadgeComponent(selectedUser.status)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700 }}>
                      Violation Warnings
                    </span>
                    <div className="num-tabular" style={{ fontSize: '1.25rem', fontWeight: 800, color: (selectedUser.warningCount || 0) > 0 ? 'var(--warning-text)' : 'var(--text-primary)', marginTop: '0.1rem' }}>
                      {selectedUser.warningCount || 0}
                    </div>
                  </div>
                </div>

                {/* Suspension Duration Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Suspension Period Selector
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                    {[
                      { label: '6 Hours', value: '6h' },
                      { label: '24 Hours', value: '24h' },
                      { label: '3 Days', value: '3d' },
                      { label: '7 Days', value: '7d' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSuspensionDuration(opt.value)}
                        style={{
                          padding: '0.5rem 0.2rem',
                          borderRadius: '6px',
                          border: suspensionDuration === opt.value ? '2px solid var(--warning)' : '1px solid var(--border-card)',
                          backgroundColor: suspensionDuration === opt.value ? 'var(--warning-bg)' : 'var(--bg-surface-elevated)',
                          color: suspensionDuration === opt.value ? 'var(--warning-text)' : 'var(--text-secondary)',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Moderation Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem' }}>
                    {/* Warn Button */}
                    <button
                      type="button"
                      onClick={() => triggerModerationConfirm(selectedUser, 'warn')}
                      className="btn-secondary"
                      style={{ color: 'var(--warning-text)', fontWeight: 700 }}
                    >
                      <AlertTriangle size={14} /> Issue Warning
                    </button>

                    {/* Suspend Button */}
                    <button
                      type="button"
                      onClick={() => triggerModerationConfirm(selectedUser, 'block')}
                      className="btn-secondary"
                      style={{ color: 'var(--danger-text)', fontWeight: 700 }}
                    >
                      <UserX size={14} /> Suspend ({suspensionDuration})
                    </button>
                  </div>

                  {/* Ban / Restore Actions */}
                  {selectedUser.status === 'blocked' || selectedUser.status === 'banned' ? (
                    <button
                      type="button"
                      onClick={() => triggerModerationConfirm(selectedUser, 'unblock')}
                      className="btn-success"
                      style={{ width: '100%', height: '38px', fontWeight: 700 }}
                    >
                      <ShieldCheck size={15} /> Restore Active Standing
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => triggerModerationConfirm(selectedUser, 'ban')}
                      className="btn-danger"
                      style={{ width: '100%', height: '38px', fontWeight: 700 }}
                    >
                      <Ban size={15} /> Permanently Ban Candidate
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button type="button" onClick={closeCandidatePanel} className="btn-secondary">
                    Close
                  </button>
                </div>
              </div>
            )}
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

