import { useState, useEffect, useCallback } from 'react';
import type { AppealItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { Check, X, User, FileText, RefreshCw, AlertTriangle, MessageSquare, CheckCircle2 } from 'lucide-react';

export function AppealsQueue() {
  const [appeals, setAppeals] = useState<AppealItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAppeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminFetch<AppealItem[]>('/api/admin/appeals');
      setAppeals(data || []);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to fetch unblock appeals queue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await adminFetch(`/api/admin/appeals/${id}/approve`, { method: 'POST' });
      setAppeals((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Failed to approve appeal: ${err.message}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await adminFetch(`/api/admin/appeals/${id}/reject`, { method: 'POST' });
      setAppeals((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(`Failed to reject appeal: ${err.message}`);
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (isLoading && appeals.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '350px', color: 'var(--text-secondary)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.75rem', color: 'var(--primary-light)' }} />
        <span>Loading appeals review queue...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Unblock Appeals Queue
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Review banned user moderation appeals, offense history, and sub-score metrics
          </p>
        </div>

        <button
          onClick={fetchAppeals}
          disabled={isLoading}
          className="btn-secondary"
          style={{ padding: '0.5rem 0.875rem', fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          <span>Refresh Queue</span>
        </button>
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
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {appeals.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CheckCircle2 size={44} style={{ margin: '0 auto 0.875rem auto', color: '#10b981', opacity: 0.8 }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.35rem 0' }}>
            No Pending Unblock Appeals
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            All candidate appeals have been processed and resolved.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {appeals.map((appeal) => {
            const isBusy = processingId === appeal.id;
            return (
              <div key={appeal.id} className="glass-panel" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* User & Ban Info Header */}
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
                        TG ID: <code>{appeal.telegramId}</code> • User ID: <code>{appeal.userId.slice(0, 8)}</code>
                      </span>
                    </div>
                  </div>

                  {/* Sub-scores Badges */}
                  {appeal.subscores && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-neutral">FC: {appeal.subscores.fc}</span>
                      <span className="badge badge-neutral">LR: {appeal.subscores.lr}</span>
                      <span className="badge badge-neutral">GRA: {appeal.subscores.gra}</span>
                      <span className="badge badge-neutral">P: {appeal.subscores.p}</span>
                    </div>
                  )}
                </div>

                {/* Ban Reason */}
                <div style={{ padding: '0.875rem 1rem', backgroundColor: 'rgba(244, 63, 94, 0.08)', borderRadius: '8px', borderLeft: '4px solid #f43f5e' }}>
                  <div style={{ fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fb7185', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Ban Infraction
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    {appeal.banReason}
                  </div>
                </div>

                {/* Offense Logs (if present) */}
                {appeal.offenseLogs && appeal.offenseLogs.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      <FileText size={14} /> Recorded Offense Violations
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
                    <MessageSquare size={14} /> Student Appeal Statement
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{appeal.appealText}"
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.875rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => handleReject(appeal.id)}
                    disabled={isBusy}
                    className="btn-danger"
                    style={{ padding: '0.5rem 1.125rem', fontSize: '0.85rem' }}
                  >
                    <X size={15} /> Reject Appeal
                  </button>

                  <button
                    onClick={() => handleApprove(appeal.id)}
                    disabled={isBusy}
                    className="btn-success"
                    style={{ padding: '0.5rem 1.125rem', fontSize: '0.85rem' }}
                  >
                    <Check size={15} /> Approve Unblock
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
