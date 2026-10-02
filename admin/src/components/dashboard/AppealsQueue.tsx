import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppealItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { PageHeader } from '../ui/PageHeader.tsx';
import { EmptyState } from '../ui/EmptyState.tsx';
import { LoadingSkeleton } from '../ui/LoadingSkeleton.tsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import {
  Check,
  X,
  User,
  FileText,
  RefreshCw,
  AlertTriangle,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';

export function AppealsQueue() {
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const busy = useRef(false);

  // Decision Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    appeal: AppealItem | null;
    action: 'approve' | 'reject' | null;
    title: string;
    message: string;
  }>({
    isOpen: false,
    appeal: null,
    action: null,
    title: '',
    message: '',
  });
  const [isProcessingDecision, setIsProcessingDecision] = useState<boolean>(false);

  const fetchAppeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AppealItem[]>('/api/admin/appeals');
      setAppeals(data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch unblock appeals queue.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  const triggerDecisionConfirm = (appeal: AppealItem, action: 'approve' | 'reject') => {
    const title = action === 'approve' ? 'Approve Unban Appeal' : 'Reject Moderation Appeal';
    const message =
      action === 'approve'
        ? `Are you sure you want to approve the appeal for ${appeal.alias} (TG: ${appeal.telegramId})? Their account standing will immediately be restored to Active.`
        : `Are you sure you want to reject the appeal for ${appeal.alias}? Their permanent ban will remain active.`;

    setConfirmDialog({
      isOpen: true,
      appeal,
      action,
      title,
      message,
    });
  };

  const handleExecuteConfirmedDecision = async () => {
    const { appeal, action } = confirmDialog;
    if (!appeal || !action || busy.current) return;
    busy.current = true; setActionError(null);

    setIsProcessingDecision(true);
    try {
      if (action === 'approve') {
        await adminFetch(`/api/admin/appeals/${appeal.id}/approve`, { method: 'POST' });
      } else {
        await adminFetch(`/api/admin/appeals/${appeal.id}/reject`, { method: 'POST' });
      }

      setAppeals((prev) => prev.filter((a) => a.id !== appeal.id));
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Decision failed.');
    } finally {
      setIsProcessingDecision(false);
      busy.current = false;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Moderation Appeals Queue"
        description="Triage permanent ban unblock requests, review violation audit logs, and assess candidate statements"
        actions={
          <button
            onClick={fetchAppeals}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh</span>
          </button>
        }
      />

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

      {isLoading && appeals.length === 0 ? (
        <LoadingSkeleton message="Retrieving moderation appeals queue..." rows={4} />
      ) : appeals.length === 0 && !error ? (
        <EmptyState
          icon={<ShieldCheck size={32} color="var(--success)" />}
          title="All moderation appeals resolved"
          description="There are currently no open unblock requests requiring administrative review."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {appeals.map((appeal) => (
            <div key={appeal.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.125rem', backgroundColor: 'var(--bg-surface)' }}>
              {/* User Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)' }}>
                    <User size={18} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                      {appeal.alias}
                    </h2>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      TG: <code>{appeal.telegramId}</code> • ID: <code>{appeal.userId.slice(0, 8)}</code>
                    </span>
                  </div>
                </div>

                {/* Sub-scores */}
                {appeal.subscores && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>FC: {appeal.subscores.fc}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>LR: {appeal.subscores.lr}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>GRA: {appeal.subscores.gra}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>P: {appeal.subscores.p}</span>
                  </div>
                )}
              </div>

              {/* Ban Reason */}
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--danger-bg)', borderRadius: '6px', borderLeft: '3px solid var(--danger)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--danger-text)', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Recorded Infraction
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {appeal.banReason}
                </div>
              </div>

              {/* Offense Logs */}
              {appeal.offenseLogs && appeal.offenseLogs.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    <FileText size={13} /> Violation Logs
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {appeal.offenseLogs.map((log, idx) => (
                      <li key={idx}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Appeal Statement */}
              <div style={{ padding: '0.875rem 1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-light)', marginBottom: '0.35rem' }}>
                  <MessageSquare size={13} /> Candidate Appeal Statement
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.45, fontStyle: 'italic' }}>
                  "{appeal.appealText}"
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => triggerDecisionConfirm(appeal, 'reject')}
                  className="btn-danger"
                  style={{ height: '32px', fontSize: '0.8rem' }}
                >
                  <X size={13} /> Reject Appeal
                </button>

                <button
                  onClick={() => triggerDecisionConfirm(appeal, 'approve')}
                  className="btn-success"
                  style={{ height: '32px', fontSize: '0.8rem' }}
                >
                  <Check size={13} /> Approve & Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision Confirm Dialog */}
      <ConfirmDialog
        error={actionError}
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        affectedItem={confirmDialog.appeal ? `${confirmDialog.appeal.alias} (TG: ${confirmDialog.appeal.telegramId})` : undefined}
        confirmLabel={confirmDialog.action === 'approve' ? 'Approve Unban' : 'Reject Appeal'}
        severity={confirmDialog.action === 'approve' ? 'info' : 'danger'}
        isConfirming={isProcessingDecision}
        onConfirm={handleExecuteConfirmedDecision}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
