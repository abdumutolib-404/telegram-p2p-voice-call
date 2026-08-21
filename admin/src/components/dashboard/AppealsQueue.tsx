import { useState, useEffect, useCallback } from 'react';
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
    if (!appeal || !action) return;

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
      alert(`Decision failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessingDecision(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <PageHeader
        title="Moderation Appeals Queue"
        description="Triage permanent ban unblock requests from candidates, review recorded offense history, and assess statements"
        actions={
          <button
            onClick={fetchAppeals}
            disabled={isLoading}
            className="btn-secondary"
            style={{ fontSize: '0.825rem', padding: '0.5rem 0.875rem' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            <span>Refresh Queue</span>
          </button>
        }
      />

      {error && (
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--danger-border)', backgroundColor: 'var(--danger-bg)', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {isLoading && appeals.length === 0 ? (
        <LoadingSkeleton message="Retrieving moderation appeals queue..." rows={4} />
      ) : appeals.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={40} color="#10b981" />}
          title="All moderation appeals resolved"
          description="There are currently no open unblock requests requiring administrative review."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {appeals.map((appeal) => (
            <div key={appeal.id} className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* User & Ban Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div style={{ padding: '0.625rem', borderRadius: '12px', backgroundColor: 'var(--danger-bg)', color: '#fb7185', border: '1px solid var(--danger-border)' }}>
                    <User size={22} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {appeal.alias}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Telegram ID: <code>{appeal.telegramId}</code> • User ID: <code>{appeal.userId.slice(0, 8)}</code>
                    </span>
                  </div>
                </div>

                {/* Sub-scores Badges */}
                {appeal.subscores && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>FC: {appeal.subscores.fc}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>LR: {appeal.subscores.lr}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>GRA: {appeal.subscores.gra}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>P: {appeal.subscores.p}</span>
                  </div>
                )}
              </div>

              {/* Ban Reason */}
              <div style={{ padding: '0.875rem 1rem', backgroundColor: 'rgba(244, 63, 94, 0.08)', borderRadius: '8px', borderLeft: '4px solid #f43f5e' }}>
                <div style={{ fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fb7185', fontWeight: 700, marginBottom: '0.25rem' }}>
                  Recorded Infraction
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  {appeal.banReason}
                </div>
              </div>

              {/* Offense Logs */}
              {appeal.offenseLogs && appeal.offenseLogs.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                    <FileText size={14} /> Violation Audit Logs
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                    {appeal.offenseLogs.map((log, idx) => (
                      <li key={idx}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Appeal Statement */}
              <div style={{ padding: '1rem 1.25rem', backgroundColor: 'var(--bg-surface-elevated)', borderRadius: '10px', border: '1px dashed var(--border-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.4rem' }}>
                  <MessageSquare size={14} /> Candidate Appeal Statement
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{appeal.appealText}"
                </p>
              </div>

              {/* Decision Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.875rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => triggerDecisionConfirm(appeal, 'reject')}
                  className="btn-danger"
                  style={{ padding: '0.45rem 1.125rem', fontSize: '0.825rem' }}
                >
                  <X size={14} /> Reject Appeal
                </button>

                <button
                  onClick={() => triggerDecisionConfirm(appeal, 'approve')}
                  className="btn-success"
                  style={{ padding: '0.45rem 1.125rem', fontSize: '0.825rem' }}
                >
                  <Check size={14} /> Approve & Restore Account
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision Confirm Dialog */}
      <ConfirmDialog
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
