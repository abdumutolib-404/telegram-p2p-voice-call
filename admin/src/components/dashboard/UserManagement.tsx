import { useState, useEffect, useCallback } from 'react';
import type { UserItem, ModerationAction } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Search, AlertTriangle, Ban, ShieldCheck, RefreshCw, UserX } from 'lucide-react';

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
        return <span style={{ color: '#38bdf8', fontWeight: 600 }}>✨ Plus</span>;
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
            User Management & Moderation
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Search user aliases or Telegram IDs and trigger manual moderation actions
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
              <th style={{ padding: '0.875rem 1rem' }}>Status</th>
              <th style={{ padding: '0.875rem 1rem' }}>Warnings</th>
              <th style={{ padding: '0.875rem 1rem' }}>Sub-scores</th>
              <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  Loading users list...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  No users found matching your criteria.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #334155' }}>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>{user.alias}</td>
                  <td style={{ padding: '0.875rem 1rem', color: '#94a3b8' }}>{user.telegramId}</td>
                  <td style={{ padding: '0.875rem 1rem' }}>{getTierBadge(user.planTier)}</td>
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
