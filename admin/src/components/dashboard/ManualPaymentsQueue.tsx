import { useClipboard, useLatestRequest } from '../../hooks/useAdminTools';
import { Dialog } from '../ui/Dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { ManualPaymentRequestItem } from '../../types/index.ts';
import { adminFetch, adminResponse } from '../../api/client.ts';
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
  Copy,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

export function ManualPaymentsQueue() {
  const [requests, setRequests] = useState<ManualPaymentRequestItem[]>([]);
  const [activeTab, setActiveTab] = useState<'queue' | 'refunds' | 'history'>('queue');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionBusy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { copiedId, copyError, copyToClipboard } = useClipboard();
  const latest = useLatestRequest();

  // Receipt Preview Modal
  const [inspectReceiptUrl, setInspectReceiptUrl] = useState<{ url: string; order: string; user: string; title?: string; mime?: string } | null>(null);

  // Approve / Reject / Refund Action Modal
  const [selectedAction, setSelectedAction] = useState<{
    type: 'approve' | 'reject' | 'refund' | 'reject_refund';
    item: ManualPaymentRequestItem;
  } | null>(null);
  const [actionNote, setActionNote] = useState<string>('');
  const [refundBillProof, setRefundBillProof] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  const fetchRequests = useCallback(async () => {
    const request = latest();
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('tab', activeTab);
      if (search.trim()) {
        params.append('search', search.trim());
      }
      const url = `/api/admin/payments/manual?${params.toString()}`;
      const data = await adminFetch<ManualPaymentRequestItem[]>(url, { signal:request.signal });
      if (!request.isCurrent()) return;
      setRequests(data || []);
    } catch (err: unknown) {
      if (!request.isCurrent()) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch payment requests');
    } finally {
      if (request.isCurrent()) setIsLoading(false);
    }
  }, [activeTab, search, latest]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRequests();
    }, 250);
    return () => { clearTimeout(timer); latest(); };
  }, [fetchRequests, latest]);



  useEffect(() => () => { if (inspectReceiptUrl?.url.startsWith('blob:')) URL.revokeObjectURL(inspectReceiptUrl.url); }, [inspectReceiptUrl]);
  const receiptLatest = useLatestRequest();
  const viewReceipt = async (item: ManualPaymentRequestItem, refund = false) => {
    const request = receiptLatest();
    try {
      const response = await adminResponse('/api/admin/payments/manual/' + item.id + '/receipt' + (refund ? '?kind=refund' : ''), {signal:request.signal});
      const blob = await response.blob();
      if (!['image/png','image/jpeg','image/webp','application/pdf'].includes(blob.type)) throw new Error('Receipt has an unsupported format.');
      if (!request.isCurrent()) return;
      setInspectReceiptUrl({ url:URL.createObjectURL(blob), mime:blob.type, order:item.orderNumber || item.id, user:item.alias, title:refund?'Refund transfer proof':'Purchase receipt' });
    } catch(error) { if (!request.isCurrent()) return; setError(error instanceof Error?error.message:'Receipt could not be opened.'); }
  };
  const handleOpenActionModal = (type: 'approve' | 'reject' | 'refund' | 'reject_refund', item: ManualPaymentRequestItem) => {
    if (actionBusy.current) return;
    setActionError(null);
    setSelectedAction({ type, item });
    setRefundBillProof('');
    setRejectionReason('');
    if (type === 'approve') setActionNote('Verified card transfer');
    else if (type === 'reject') setActionNote('Receipt unverified');
    else if (type === 'refund') setActionNote('UZS Refund approved and money transferred');
    else if (type === 'reject_refund') setActionNote('Refund request rejected by administration');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setActionError('File is too large. Use a PNG, JPEG, WebP or PDF under 5 MB.');
      return;
    }

    if (!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type)) { setActionError('Use a PNG, JPEG, WebP or PDF file.'); return; }
    setActionError(null);
    const reader = new FileReader();
    reader.onerror = () => setActionError('File could not be read.');
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result;
      if (typeof result === 'string') {
        setRefundBillProof(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExecuteAction = async () => {
    if (!selectedAction || actionBusy.current) return;
    const { type, item } = selectedAction;

    if (type === 'refund' && !refundBillProof.trim()) {
      setActionError('Attach the refund transfer proof before approving.');
      return;
    }

    if (type === 'reject_refund' && !rejectionReason.trim()) {
      setActionError('Provide a reason for rejecting the refund request.');
      return;
    }

    actionBusy.current = true; setActionError(null);
    setIsProcessingAction(true);

    try {
      if (type === 'approve') {
        await adminFetch(`/api/admin/payments/manual/${item.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ note: actionNote.trim() || undefined }),
        });
      } else if (type === 'reject') {
        await adminFetch(`/api/admin/payments/manual/${item.id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ note: actionNote.trim() || 'Receipt unverified' }),
        });
      } else if (type === 'refund') {
        await adminFetch(`/api/admin/payments/manual/${item.id}/refund`, {
          method: 'POST',
          body: JSON.stringify({
            refundProof: refundBillProof.trim(),
            note: actionNote.trim() || undefined,
          }),
        });
      } else if (type === 'reject_refund') {
        await adminFetch(`/api/admin/payments/manual/${item.id}/reject-refund`, {
          method: 'POST',
          body: JSON.stringify({
            reason: rejectionReason.trim(),
            note: rejectionReason.trim(),
          }),
        });
      }

      setSelectedAction(null);
      await fetchRequests();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Payment action failed.');
    } finally {
      actionBusy.current = false; setIsProcessingAction(false);
    }
  };

  const getStatusBadgeComponent = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <StatusBadge variant="success" label="Approved" size="sm" />;
      case 'REJECTED':
        return <StatusBadge variant="danger" label="Rejected" size="sm" />;
      case 'REFUND_PENDING':
        return <StatusBadge variant="warning" label="Refund Requested" size="sm" />;
      case 'REFUNDED':
        return <StatusBadge variant="info" label="Refunded" size="sm" />;
      default:
        return <StatusBadge variant="warning" label="Pending" size="sm" />;
    }
  };

  const getPlanBadgeComponent = (plan: string) => {
    switch (plan?.toUpperCase()) {
      case 'BOSS':
        return <StatusBadge variant="gold" label="BOSS" size="sm" />;
      case 'PRO':
        return <StatusBadge variant="info" label="PRO" size="sm" />;
      case 'PLUS':
        return <StatusBadge variant="info" label="PLUS" size="sm" />;
      default:
        return <StatusBadge variant="neutral" label={plan} size="sm" />;
    }
  };

  const pendingCount = activeTab === 'queue' ? requests.filter((r) => r.status === 'PENDING').length : 0;
  const refundCount = activeTab === 'refunds' ? requests.filter((r) => r.status === 'REFUND_PENDING').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {copyError && <p role="alert" className="inline-error">{copyError}</p>}
      <PageHeader
        title="Manual Payments (UZS)"
        description="Verify candidate offline card/bank transfers, inspect receipts, and manage fulfillment"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Segmented Tab Controls */}
            <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.25rem', border: '1px solid var(--border-card)' }}>
              <button
                onClick={() => setActiveTab('queue')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: activeTab === 'queue' ? 'var(--primary-bg)' : 'transparent',
                  color: activeTab === 'queue' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'queue' ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <Inbox size={14} />
                <span>Pending Receipts</span>
                {pendingCount > 0 && (
                  <span style={{ padding: '0.1rem 0.45rem', borderRadius: '9999px', fontSize: '0.7rem', backgroundColor: 'var(--warning)', color: '#FFFFFF', fontWeight: 600 }}>
                    {pendingCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('refunds')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: activeTab === 'refunds' ? 'var(--primary-bg)' : 'transparent',
                  color: activeTab === 'refunds' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'refunds' ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <RefreshCw size={14} />
                <span>Refund Requests</span>
                {refundCount > 0 && (
                  <span style={{ padding: '0.1rem 0.45rem', borderRadius: '9999px', fontSize: '0.7rem', backgroundColor: 'var(--danger)', color: '#FFFFFF', fontWeight: 600 }}>
                    {refundCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: activeTab === 'history' ? 'var(--primary-bg)' : 'transparent',
                  color: activeTab === 'history' ? '#FFFFFF' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'history' ? 600 : 500,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
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
              style={{ fontSize: '0.825rem' }}
            >
              <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Search Input */}
      <div style={{ position: 'relative', maxWidth: '380px' }}>
        <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input aria-label="Search by Order #, Telegram ID, or Alias..."
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Order #, Telegram ID, or Alias..."
          className="input-modern"
          style={{ width: '100%', paddingLeft: '2.25rem', boxSizing: 'border-box' }}
        />
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
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Payments Table */}
      {isLoading && requests.length === 0 && !error ? (
        <LoadingSkeleton message="Loading payment transactions..." rows={5} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={32} color="var(--text-muted)" />}
          title={
            activeTab === 'queue'
              ? 'No pending manual payment receipts'
              : activeTab === 'refunds'
              ? 'No pending refund requests'
              : 'No payment history found'
          }
          description={
            activeTab === 'queue'
              ? 'All offline card payments have been processed and fulfilled.'
              : activeTab === 'refunds'
              ? 'There are no active UZS refund requests awaiting administrative review.'
              : search
              ? `No transactions matching "${search}".`
              : 'Approved, rejected, and refunded transactions will appear here.'
          }
        />
      ) : (
        <div className="table-container">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Candidate & Telegram ID</th>
                <th>Plan & Amount</th>
                {activeTab === 'refunds' ? (
                  <>
                    <th>Purchase Date</th>
                    <th>Used Limits</th>
                    <th>Receiving Card Number</th>
                    <th>Original Receipt</th>
                  </>
                ) : (
                  <>
                    <th>Receipt Proof</th>
                    <th>Created / Date</th>
                  </>
                )}
                <th>Status & Details</th>
                {(activeTab === 'queue' || activeTab === 'refunds') && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => {
                const orderDisplay = req.orderNumber || `A${req.id.slice(0, 4)}`;
                const callsUsed = req.user?.dailyCallsUsed ?? 0;
                const callLimit = req.user?.dailyLimit ?? (req.planTier === 'PRO' ? 25 : req.planTier === 'BOSS' ? 50 : 10);

                return (
                  <tr key={req.id}>
                    {/* Order # */}
                    <td style={{ fontWeight: 600, color: 'var(--primary-light)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code>{orderDisplay}</code>
                        <button
                          onClick={() => copyToClipboard(orderDisplay, `order-${req.id}`)}
                          title="Copy Order #"
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                        >
                          {copiedId === `order-${req.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                        </button>
                      </div>
                    </td>

                    {/* Candidate */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.alias}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        TG: <code>{req.telegramId}</code>
                      </div>
                    </td>

                    {/* Plan & Amount */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.2rem' }}>
                        {getPlanBadgeComponent(req.planTier)}
                      </div>
                      <div className="num-tabular" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.825rem' }}>
                        {req.amountUzs.toLocaleString('en-US')} UZS
                      </div>
                    </td>

                    {/* REFUND SPECIFIC COLUMNS */}
                    {activeTab === 'refunds' ? (
                      <>
                        {/* Purchase Date */}
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <div>{new Date(req.createdAt).toLocaleDateString()}</div>
                          <div style={{ color: 'var(--text-muted)' }}>{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>

                        {/* Used Limits */}
                        <td>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: callsUsed > 0 ? 'var(--warning)' : 'var(--success)' }}>
                            {callsUsed} / {callLimit} calls
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {callsUsed < callLimit * 0.1 ? 'Eligible (<10%)' : 'Check Policy'}
                          </div>
                        </td>

                        {/* Card to Send Money */}
                        <td>
                          {req.refundCardNumber ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-surface-elevated)', padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-card)' }}>
                              <code style={{ fontSize: '0.8rem', color: 'var(--primary-light)', fontWeight: 600 }}>{req.refundCardNumber}</code>
                              <button
                                onClick={() => copyToClipboard(req.refundCardNumber!.replace(/\s/g, ''), `card-${req.id}`)}
                                title="Copy Card Number"
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex' }}
                              >
                                {copiedId === `card-${req.id}` ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not specified</span>
                          )}
                        </td>

                        {/* Original Receipt */}
                        <td>
                          {req.paymentProof ? (
                            <button
                              onClick={() => void viewReceipt(req)}
                              className="btn-secondary"
                              style={{ padding: '0 0.55rem', height: '28px', fontSize: '0.75rem', color: 'var(--primary-light)' }}
                            >
                              <Eye size={12} /> View Receipt
                            </button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Receipt Proof */}
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {req.paymentProof && (
                              <button
                                onClick={() => void viewReceipt(req)}
                                className="btn-secondary"
                                style={{ padding: '0 0.55rem', height: '28px', fontSize: '0.75rem', color: 'var(--primary-light)' }}
                              >
                                <Eye size={12} /> Receipt
                              </button>
                            )}
                            {req.refundProof && (
                              <button
                                onClick={() => void viewReceipt(req, true)}
                                className="btn-secondary"
                                style={{ padding: '0 0.55rem', height: '28px', fontSize: '0.75rem', color: 'var(--success)' }}
                              >
                                <FileText size={12} /> Refund Bill
                              </button>
                            )}
                            {!req.paymentProof && !req.refundProof && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>None</span>
                            )}
                          </div>
                        </td>

                        {/* Created / Date */}
                        <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                          <div>{new Date(req.createdAt).toLocaleDateString()} {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          {req.reviewedAt && (
                            <div style={{ color: 'var(--success-text)', marginTop: '0.1rem' }}>
                              by {req.reviewedBy || 'Admin'}
                            </div>
                          )}
                        </td>
                      </>
                    )}

                    {/* Status & Details */}
                    <td>
                      {getStatusBadgeComponent(req.status)}
                      {req.refundCardNumber && activeTab !== 'refunds' && (
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          Card: <code>{req.refundCardNumber}</code>
                        </div>
                      )}
                      {req.refundReason && (
                        <div style={{ fontSize: '0.725rem', color: 'var(--danger)', marginTop: '0.2rem' }}>
                          Reason: {req.refundReason}
                        </div>
                      )}
                      {req.adminNote && !req.refundReason && (
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                          Note: {req.adminNote}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    {activeTab === 'queue' && (
                      <td style={{ textAlign: 'right' }}>
                        {req.status === 'PENDING' && (
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button
                              onClick={() => handleOpenActionModal('approve', req)}
                              className="btn-success"
                              style={{ padding: '0 0.65rem', height: '30px', fontSize: '0.75rem' }}
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              onClick={() => handleOpenActionModal('reject', req)}
                              className="btn-danger"
                              style={{ padding: '0 0.65rem', height: '30px', fontSize: '0.75rem' }}
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}

                    {activeTab === 'refunds' && (
                      <td style={{ textAlign: 'right' }}>
                        {req.status === 'REFUND_PENDING' && (
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button
                              onClick={() => handleOpenActionModal('refund', req)}
                              className="btn-success"
                              style={{ padding: '0 0.65rem', height: '30px', fontSize: '0.75rem' }}
                            >
                              <Check size={12} /> Approve Refund
                            </button>
                            <button
                              onClick={() => handleOpenActionModal('reject_refund', req)}
                              className="btn-danger"
                              style={{ padding: '0 0.65rem', height: '30px', fontSize: '0.75rem' }}
                            >
                              <X size={12} /> Reject Refund
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipt Viewer Modal */}
      {inspectReceiptUrl && (
        <Dialog title="Receipt preview" pending={false} onClose={() => { setInspectReceiptUrl(null); }}><fieldset disabled={false} style={{border:0,padding:0,margin:0,minWidth:0}}>
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.5rem',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Receipt Inspection — Order #{inspectReceiptUrl.order}
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Candidate: {inspectReceiptUrl.user}</span>
              </div>
              <button
                onClick={() => setInspectReceiptUrl(null)}
                className="btn-secondary"
                style={{ padding: '0 0.75rem', height: '32px', fontSize: '0.75rem' }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                width: '100%',
                maxHeight: '60vh',
                overflow: 'auto',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '8px',
                border: '1px solid var(--border-card)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
              }}
            >
              {inspectReceiptUrl.url.startsWith('blob:') ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  {inspectReceiptUrl.mime === 'application/pdf' ? <iframe title="Receipt document" src={inspectReceiptUrl.url} sandbox="" style={{width:'100%',height:'55vh'}}/> : <img
                    src={inspectReceiptUrl.url}
                    alt="Payment Receipt"
                    style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: '4px' }}
                  />}
                  <div style={{ marginTop: '0.5rem' }}>
                    <a
                      href={inspectReceiptUrl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.75rem', color: 'var(--primary-light)', textDecoration: 'underline' }}
                    >
                      Open in new tab ↗
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <FileText size={32} style={{ margin: '0 auto 0.5rem auto', color: 'var(--primary-light)' }} />
                  <div>Receipt Reference: <code>{inspectReceiptUrl.url}</code></div>
                </div>
              )}
            </div>
          </div>
        </fieldset></Dialog>
      )}

      {/* Action Dialog: Approve Payment / Reject Payment / Approve Refund / Reject Refund */}
      {selectedAction && (
        <Dialog title="Payment action" pending={isProcessingAction} onClose={() => { setSelectedAction(null); }}><fieldset disabled={isProcessingAction} style={{border:0,padding:0,margin:0,minWidth:0}}>{actionError && <p role="alert" className="inline-error">{actionError}</p>}
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '1.75rem',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.35rem 0', color: 'var(--text-primary)' }}>
              {selectedAction.type === 'approve'
                ? 'Approve Payment & Fulfill Plan'
                : selectedAction.type === 'reject'
                ? 'Reject Payment Request'
                : selectedAction.type === 'refund'
                ? 'Approve Refund & Attach Transfer Bill'
                : 'Reject Refund Request'}
            </h3>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1.25rem 0' }}>
              Order <code style={{ color: 'var(--text-primary)' }}>#{selectedAction.item.orderNumber || selectedAction.item.id.slice(0, 4)}</code> for{' '}
              <strong>{selectedAction.item.alias}</strong> ({selectedAction.item.amountUzs.toLocaleString()} UZS for {selectedAction.item.planTier})
            </p>

            {/* Target Card Highlight for Refunds */}
            {selectedAction.type === 'refund' && selectedAction.item.refundCardNumber && (
              <div style={{ backgroundColor: 'var(--bg-surface-elevated)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-card)', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                  Send refund ({selectedAction.item.amountUzs.toLocaleString()} UZS) to card:
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <code style={{ fontSize: '1rem', color: 'var(--primary-light)', fontWeight: 700 }}>
                    {selectedAction.item.refundCardNumber}
                  </code>
                  <button
                    onClick={() => copyToClipboard(selectedAction.item.refundCardNumber!.replace(/\s/g, ''), 'modal-card')}
                    className="btn-secondary"
                    style={{ padding: '0 0.5rem', height: '26px', fontSize: '0.75rem' }}
                  >
                    {copiedId === 'modal-card' ? <Check size={12} color="var(--success)" /> : <Copy size={12} />} Copy
                  </button>
                </div>
              </div>
            )}

            {/* REFUND APPROVAL: Enforce Bank Transfer Bill Upload */}
            {selectedAction.type === 'refund' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Bank Transfer Bill / Proof Image <span style={{ color: 'var(--danger)' }}>*</span>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label
                    className="btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      padding: '0.6rem 1rem',
                      border: '1px dashed var(--primary-light)',
                      backgroundColor: 'var(--bg-surface-elevated)',
                    }}
                  >
                    <Upload size={15} />
                    <span>{refundBillProof ? 'Replace Bill Image' : 'Upload Bank Transfer Bill Image'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleFileUpload}
                      aria-label="Refund transfer proof file"
                    />
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Or paste a PNG, JPEG, WebP or PDF data URL:</span>
                  </div>
                  <input aria-label="https://... or upload image above"
                    type="text"
                    value={refundBillProof.startsWith('data:') ? 'Image uploaded (base64)' : refundBillProof}
                    onChange={(e) => setRefundBillProof(e.target.value)}
                    placeholder="https://... or upload image above"
                    disabled={refundBillProof.startsWith('data:')}
                    className="input-modern"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.8rem' }}
                  />

                  {refundBillProof && (
                    <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ImageIcon size={14} color="var(--success)" />
                      <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Transfer bill attached & ready to send</span>
                      <button
                        onClick={() => setRefundBillProof('')}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* REJECT REFUND: Enforce Mandatory Rejection Reason */}
            {selectedAction.type === 'reject_refund' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Rejection Reason (Sent to Student on Telegram) <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input aria-label="Rejection Reason (Sent to Student on Telegram) *"
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Limits exceeded (>10% used) or invalid transaction"
                  className="input-modern"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Optional Audit Note for other actions */}
            {(selectedAction.type === 'approve' || selectedAction.type === 'reject' || selectedAction.type === 'refund') && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {selectedAction.type === 'reject' ? 'Rejection Reason (Sent to Student)' : 'Audit Note (Optional)'}
                </label>
                <input
                  type="text"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder={
                    selectedAction.type === 'approve'
                      ? 'Verified card transfer'
                      : selectedAction.type === 'refund'
                      ? 'Payment refund approved and returned to card'
                      : 'Receipt unverified'
                  }
                  className="input-modern"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            )}

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
                disabled={
                  isProcessingAction ||
                  (selectedAction.type === 'refund' && !refundBillProof.trim()) ||
                  (selectedAction.type === 'reject_refund' && !rejectionReason.trim())
                }
                className={selectedAction.type === 'approve' || selectedAction.type === 'refund' ? 'btn-success' : 'btn-danger'}
              >
                {isProcessingAction
                  ? 'Processing...'
                  : selectedAction.type === 'approve'
                  ? 'Confirm Approval'
                  : selectedAction.type === 'refund'
                  ? 'Approve & Send Bill'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </fieldset></Dialog>
      )}
    </div>
  );
}
