import { useState, useEffect, useCallback } from 'react';
import type { ManualPaymentRequestItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { CreditCard, Check, X, Clock, AlertCircle, RefreshCw, Search, History, Inbox, FileText } from 'lucide-react';

export function ManualPaymentsQueue() {
  const [requests, setRequests] = useState<ManualPaymentRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('tab', activeTab);
      if (search.trim()) {
        params.append('search', search.trim());
      }
      const url = `/api/admin/payments/manual?${params.toString()}`;
      const data = await adminFetch<ManualPaymentRequestItem[]>(url);
      setRequests(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payment requests');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchRequests]);

  const handleApprove = async (id: string, orderNumber: string) => {
    const note = window.prompt(`Approval note for Order #${orderNumber} (optional):`, 'Verified receipt') || '';
    setActionLoadingId(id);
    try {
      await adminFetch(`/api/admin/payments/manual/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      await fetchRequests();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string, orderNumber: string) => {
    const note = window.prompt(`Reason for rejecting Order #${orderNumber}:`, 'Receipt unverified') || 'Receipt unverified';
    setActionLoadingId(id);
    try {
      await adminFetch(`/api/admin/payments/manual/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      await fetchRequests();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <span className="badge badge-success">● APPROVED</span>;
      case 'REJECTED':
        return <span className="badge badge-danger">● REJECTED</span>;
      case 'REFUNDED':
        return <span className="badge badge-info">● REFUNDED</span>;
      default:
        return <span className="badge badge-warning">● PENDING</span>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'BOSS':
        return <span className="badge badge-gold">{plan}</span>;
      case 'PRO':
        return <span className="badge badge-warning">{plan}</span>;
      case 'PLUS':
        return <span className="badge badge-info">{plan}</span>;
      default:
        return <span className="badge badge-neutral">{plan}</span>;
    }
  };

  const pendingCount = activeTab === 'queue' ? requests.filter(r => r.status === 'PENDING').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Manual Payment Management (UZS)
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Review, verify, and approve offline card and bank transfer orders from Uzbek students
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Segmented Control for Tabs */}
          <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '10px', padding: '0.25rem', border: '1px solid var(--border-card)' }}>
            <button
              onClick={() => setActiveTab('queue')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'queue' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'queue' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Inbox size={14} />
              <span>Pending Queue</span>
              {pendingCount > 0 && (
                <span style={{ padding: '0.1rem 0.4rem', borderRadius: '9999px', fontSize: '0.7rem', backgroundColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }}>
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeTab === 'history' ? 'var(--primary)' : 'transparent',
                color: activeTab === 'history' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <History size={14} />
              <span>Payment History</span>
            </button>
          </div>

          <button
            onClick={() => fetchRequests()}
            disabled={isLoading}
            className="btn-secondary"
            style={{ padding: '0.5rem 0.875rem', fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '420px' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Order #, User Alias, TG ID..."
          className="input-modern"
          style={{ width: '100%', paddingLeft: '2.5rem', boxSizing: 'border-box' }}
        />
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: '10px',
            padding: '0.875rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: '#fca5a5',
            fontSize: '0.875rem',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px', color: 'var(--text-secondary)' }}>
          <Clock size={22} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem', color: 'var(--primary-light)' }} />
          <span>Loading payment requests...</span>
        </div>
      ) : requests.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CreditCard size={42} style={{ margin: '0 auto 0.875rem auto', color: 'var(--text-muted)', opacity: 0.5 }} />
          <p style={{ margin: 0, fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
            {activeTab === 'queue' ? 'No pending manual payment requests.' : 'No payment history records found.'}
          </p>
          <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
            New offline card receipts from students will populate here in real-time.
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Order #</th>
                <th>User Alias & TG ID</th>
                <th>Plan Tier</th>
                <th>Amount (UZS)</th>
                <th>Status</th>
                <th>Receipt / Proof</th>
                <th>Timestamps & Reviewer</th>
                {activeTab === 'queue' && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td style={{ fontWeight: 700, color: 'var(--primary-light)' }}>
                    <code>{req.orderNumber || `A${req.id.slice(0, 4)}`}</code>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.alias}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TG: <code>{req.telegramId}</code></div>
                  </td>
                  <td>
                    {getPlanBadge(req.planTier)}
                  </td>
                  <td className="num-tabular" style={{ fontWeight: 700, color: '#34d399' }}>
                    {req.amountUzs.toLocaleString('en-US')} UZS
                  </td>
                  <td>
                    {getStatusBadge(req.status)}
                    {req.adminNote && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        Note: {req.adminNote}
                      </div>
                    )}
                  </td>
                  <td>
                    {req.paymentProof ? (
                      <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                        <FileText size={12} /> Receipt Uploaded
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No proof attached</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <div>Created: {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    {req.reviewedAt && (
                      <div style={{ color: '#6ee7b7', marginTop: '0.2rem' }}>
                        Reviewed: {new Date(req.reviewedAt).toLocaleDateString()} {req.reviewedBy ? `by ${req.reviewedBy}` : ''}
                      </div>
                    )}
                  </td>
                  {activeTab === 'queue' && (
                    <td style={{ textAlign: 'right' }}>
                      {req.status === 'PENDING' && (
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleApprove(req.id, req.orderNumber || req.id.slice(0, 4))}
                            disabled={actionLoadingId === req.id}
                            className="btn-success"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <Check size={13} />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(req.id, req.orderNumber || req.id.slice(0, 4))}
                            disabled={actionLoadingId === req.id}
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <X size={13} />
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
