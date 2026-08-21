import { useState, useEffect, useCallback } from 'react';
import type { ManualPaymentRequestItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { StatusBadge } from '../ui/StatusBadge.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import {
  CreditCard,
  Check,
  X,
  RefreshCw,
  Search,
  History,
  Inbox,
  FileText,
  Eye,
  AlertCircle,
  Copy
} from 'lucide-react';

export function ManualPaymentsQueue() {
  const [requests, setRequests] = useState<ManualPaymentRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Receipt Preview Modal
  const [inspectReceiptUrl, setInspectReceiptUrl] = useState<{ url: string; order: string; user: string } | null>(null);

  // Approve / Reject Action Modals
  const [selectedAction, setSelectedAction] = useState<{
    type: 'approve' | 'reject';
    item: ManualPaymentRequestItem;
  } | null>(null);
  const [actionNote, setActionNote] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

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
      setRequests(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payment requests');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchRequests]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenActionModal = (type: 'approve' | 'reject', item: ManualPaymentRequestItem) => {
    setSelectedAction({ type, item });
    setActionNote(type === 'approve' ? 'Verified bank transfer' : 'Receipt unverified');
  };

  const handleExecuteAction = async () => {
    if (!selectedAction) return;
    const { type, item } = selectedAction;
    setIsProcessingAction(true);

    try {
      if (type === 'approve') {
        await adminFetch(`/api/admin/payments/manual/${item.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ note: actionNote.trim() || undefined }),
        });
      } else {
        await adminFetch(`/api/admin/payments/manual/${item.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ note: actionNote.trim() || 'Receipt unverified' }),
        });
      }

      setSelectedAction(null);
      await fetchRequests();
    } catch (err: unknown) {
      alert(`Payment action failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const getStatusBadgeComponent = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <StatusBadge variant="success" label="APPROVED" size="sm" />;
      case 'REJECTED':
        return <StatusBadge variant="danger" label="REJECTED" size="sm" />;
      case 'REFUNDED':
        return <StatusBadge variant="info" label="REFUNDED" size="sm" />;
      default:
        return <StatusBadge variant="warning" label="PENDING" size="sm" />;
    }
  };

  const getPlanBadgeComponent = (plan: string) => {
    switch (plan?.toUpperCase()) {
      case 'BOSS':
        return <StatusBadge variant="gold" label="👑 BOSS" size="sm" />;
      case 'PRO':
        return <StatusBadge variant="warning" label="⭐ PRO" size="sm" />;
      case 'PLUS':
        return <StatusBadge variant="info" label="⚡ PLUS" size="sm" />;
      default:
        return <StatusBadge variant="neutral" label={plan} size="sm" />;
    }
  };

  const pendingCount = activeTab === 'queue' ? requests.filter((r) => r.status === 'PENDING').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <PageHeader
        title="Manual Payment Queue (UZS)"
        description="Verify candidate bank/card transfers, inspect receipts, and manage offline subscription fulfillments"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Segmented Tab Controls */}
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
                <span>Pending Verification</span>
                {pendingCount > 0 && (
                  <span style={{ padding: '0.1rem 0.45rem', borderRadius: '9999px', fontSize: '0.7rem', backgroundColor: 'rgba(255,255,255,0.25)', color: '#ffffff' }}>
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
        }
      />

      {/* Search Bar */}
      <div style={{ position: 'relative', maxWidth: '440px' }}>
        <Search size={16} style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Order # (e.g. A42), Telegram ID, or Alias..."
          className="input-modern"
          style={{ width: '100%', paddingLeft: '2.5rem', boxSizing: 'border-box' }}
        />
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Payments Table */}
      {isLoading && requests.length === 0 ? (
        <LoadingSkeleton message="Fetching payment records..." rows={5} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={40} />}
          title={activeTab === 'queue' ? 'No pending manual payment receipts' : 'No payment history records found'}
          description={
            activeTab === 'queue'
              ? 'All offline card payments have been processed and fulfilled.'
              : search
              ? `No transactions matched "${search}".`
              : 'Completed and rejected transactions will appear here.'
          }
        />
      ) : (
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Candidate Alias & Telegram ID</th>
                <th>Requested Plan</th>
                <th>Amount (UZS)</th>
                <th>Status</th>
                <th>Receipt / Proof</th>
                <th>Date & Reviewer</th>
                {activeTab === 'queue' && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td style={{ fontWeight: 700, color: 'var(--primary-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <code>{req.orderNumber || `A${req.id.slice(0, 4)}`}</code>
                      <button
                        onClick={() => copyToClipboard(req.orderNumber || req.id.slice(0, 4), `order-${req.id}`)}
                        title="Copy Order #"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                      >
                        {copiedId === `order-${req.id}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.alias}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      TG: <code>{req.telegramId}</code>
                    </div>
                  </td>
                  <td>{getPlanBadgeComponent(req.planTier)}</td>
                  <td className="num-tabular" style={{ fontWeight: 700, color: '#34d399' }}>
                    {req.amountUzs.toLocaleString('en-US')} UZS
                  </td>
                  <td>
                    {getStatusBadgeComponent(req.status)}
                    {req.adminNote && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Note: {req.adminNote}
                      </div>
                    )}
                  </td>
                  <td>
                    {req.paymentProof ? (
                      <button
                        onClick={() => setInspectReceiptUrl({ url: req.paymentProof!, order: req.orderNumber || req.id.slice(0, 4), user: req.alias })}
                        className="btn-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: 'var(--primary-light)', borderColor: 'rgba(99, 102, 241, 0.3)' }}
                      >
                        <Eye size={13} /> View Receipt
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file</span>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <div>{new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    {req.reviewedAt && (
                      <div style={{ color: '#6ee7b7', marginTop: '0.15rem' }}>
                        Reviewed by {req.reviewedBy || 'Admin'}
                      </div>
                    )}
                  </td>
                  {activeTab === 'queue' && (
                    <td style={{ textAlign: 'right' }}>
                      {req.status === 'PENDING' && (
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleOpenActionModal('approve', req)}
                            className="btn-success"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <Check size={13} /> Approve
                          </button>
                          <button
                            onClick={() => handleOpenActionModal('reject', req)}
                            className="btn-danger"
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                          >
                            <X size={13} /> Reject
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

      {/* Receipt Viewer Modal */}
      {inspectReceiptUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(9, 13, 22, 0.9)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '1.5rem',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '640px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Receipt Inspection — Order #{inspectReceiptUrl.order}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Candidate: {inspectReceiptUrl.user}</span>
              </div>
              <button
                onClick={() => setInspectReceiptUrl(null)}
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                width: '100%',
                maxHeight: '65vh',
                overflow: 'auto',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: '8px',
                border: '1px solid var(--border-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
              }}
            >
              {inspectReceiptUrl.url.startsWith('http') || inspectReceiptUrl.url.startsWith('data:') ? (
                <img
                  src={inspectReceiptUrl.url}
                  alt="Payment Receipt"
                  style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '4px' }}
                />
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <FileText size={36} style={{ margin: '0 auto 0.5rem auto', color: 'var(--primary-light)' }} />
                  <div>Receipt Reference: <code>{inspectReceiptUrl.url}</code></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approve / Reject Dialog */}
      {selectedAction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(9, 13, 22, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
            padding: '1.5rem',
          }}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '1.75rem',
              boxSizing: 'border-box',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>
              {selectedAction.type === 'approve' ? 'Approve Payment & Fulfill Plan' : 'Reject Payment Request'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Order <code style={{ color: 'var(--text-primary)' }}>#{selectedAction.item.orderNumber || selectedAction.item.id.slice(0, 4)}</code> for{' '}
              <strong>{selectedAction.item.alias}</strong> ({selectedAction.item.amountUzs.toLocaleString()} UZS for {selectedAction.item.planTier})
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {selectedAction.type === 'approve' ? 'Audit Note (Optional)' : 'Rejection Reason (Dispatched to Student)'}
              </label>
              <input
                type="text"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={selectedAction.type === 'approve' ? 'Verified card receipt' : 'Receipt unclear or amount mismatch'}
                className="input-modern"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setSelectedAction(null)}
                disabled={isProcessingAction}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={isProcessingAction}
                className={selectedAction.type === 'approve' ? 'btn-success' : 'btn-danger'}
              >
                {isProcessingAction ? 'Processing...' : selectedAction.type === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
