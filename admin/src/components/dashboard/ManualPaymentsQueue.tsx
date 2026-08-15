import { useState, useEffect, useCallback } from 'react';
import type { ManualPaymentRequestItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { CreditCard, Check, X, Clock, AlertCircle, RefreshCw, Search, History, Inbox } from 'lucide-react';

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
        return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#064e3b', color: '#6ee7b7' }}>APPROVED</span>;
      case 'REJECTED':
        return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#451a1a', color: '#fca5a5' }}>REJECTED</span>;
      case 'REFUNDED':
        return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#312e81', color: '#a5b4fc' }}>REFUNDED</span>;
      default:
        return <span style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backgroundColor: '#78350f', color: '#fcd34d' }}>PENDING</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Manual Payment Management (UZS)
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Review, verify, and track offline card and bank transfer orders
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Tabs */}
          <div style={{ display: 'inline-flex', backgroundColor: '#0f172a', borderRadius: '8px', padding: '0.25rem', border: '1px solid #334155' }}>
            <button
              onClick={() => setActiveTab('queue')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'queue' ? '#3b82f6' : 'transparent',
                color: activeTab === 'queue' ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <Inbox size={14} />
              Pending Queue
            </button>
            <button
              onClick={() => setActiveTab('history')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'history' ? '#3b82f6' : 'transparent',
                color: activeTab === 'history' ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <History size={14} />
              Payment History
            </button>
          </div>

          <button
            onClick={() => fetchRequests()}
            disabled={isLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.875rem',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '400px' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Order # (e.g. A21), User, TG ID, Plan..."
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem 0.5rem 2.25rem',
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            color: '#f8fafc',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div style={{ backgroundColor: '#451a1a', border: '1px solid #991b1b', borderRadius: '8px', padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#fca5a5' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: '#94a3b8' }}>
          <Clock size={20} className="animate-spin" style={{ marginRight: '0.5rem' }} />
          Loading payment requests...
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: '3rem 1rem', textAlign: 'center', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#94a3b8' }}>
          <CreditCard size={36} style={{ margin: '0 auto 0.75rem auto', color: '#64748b' }} />
          <p style={{ margin: 0, fontWeight: 500 }}>
            {activeTab === 'queue' ? 'No pending manual payment requests found.' : 'No payment history records found.'}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.875rem 1rem' }}>Order #</th>
                <th style={{ padding: '0.875rem 1rem' }}>User Alias & TG ID</th>
                <th style={{ padding: '0.875rem 1rem' }}>Plan Tier</th>
                <th style={{ padding: '0.875rem 1rem' }}>Amount (UZS)</th>
                <th style={{ padding: '0.875rem 1rem' }}>Status</th>
                <th style={{ padding: '0.875rem 1rem' }}>Receipt / Proof</th>
                <th style={{ padding: '0.875rem 1rem' }}>Timestamps & Reviewer</th>
                {activeTab === 'queue' && <th style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} style={{ borderBottom: '1px solid #33415540' }}>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 700, color: '#38bdf8' }}>
                    <code>{req.orderNumber || `A${req.id.slice(0, 4)}`}</code>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#f8fafc' }}>{req.alias}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>TG: <code>{req.telegramId}</code></div>
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    <span style={{ fontWeight: 700, color: req.planTier === 'BOSS' ? '#ec4899' : req.planTier === 'PRO' ? '#fbbf24' : '#38bdf8' }}>
                      {req.planTier}
                    </span>
                  </td>
                  <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                    {req.amountUzs.toLocaleString('en-US')} UZS
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {getStatusBadge(req.status)}
                    {req.adminNote && (
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        Note: {req.adminNote}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem' }}>
                    {req.paymentProof ? (
                      <span style={{ padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: '#0369a1', color: '#e0f2fe' }}>
                        🧾 Receipt Uploaded
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>No proof file</span>
                    )}
                  </td>
                  <td style={{ padding: '0.875rem 1rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                    <div>Created: {new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    {req.reviewedAt && (
                      <div style={{ color: '#6ee7b7', marginTop: '0.15rem' }}>
                        Reviewed: {new Date(req.reviewedAt).toLocaleDateString()} {req.reviewedBy ? `by ${req.reviewedBy}` : ''}
                      </div>
                    )}
                  </td>
                  {activeTab === 'queue' && (
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      {req.status === 'PENDING' && (
                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => handleApprove(req.id, req.orderNumber || req.id.slice(0, 4))}
                            disabled={actionLoadingId === req.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.4rem 0.75rem',
                              backgroundColor: '#059669',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: actionLoadingId === req.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <Check size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(req.id, req.orderNumber || req.id.slice(0, 4))}
                            disabled={actionLoadingId === req.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.4rem 0.75rem',
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              cursor: actionLoadingId === req.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <X size={14} />
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
