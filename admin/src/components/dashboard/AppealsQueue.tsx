import { useState, useEffect, useCallback } from 'react';
import type { AppealItem } from '../../types/index.ts';
import { adminFetch } from '../../api/client.ts';
import { ShieldAlert, Check, X, User, FileText, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#94a3b8' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }} />
        Loading appeals review queue...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            Unblock Appeals Queue
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
            Review banned user moderation appeals, offense logs, and sub-score metrics
          </p>
        </div>
        <button
          onClick={fetchAppeals}
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
          Refresh Queue
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#451a1a',
          border: '1px solid #991b1b',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#fca5a5',
          fontSize: '0.875rem'
        }}>
          <AlertTriangle size={20} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {appeals.length === 0 ? (
        <div style={{
          backgroundColor: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '3rem 2rem',
          textAlign: 'center',
          color: '#94a3b8'
        }}>
          <ShieldAlert size={48} style={{ opacity: 0.5, marginBottom: '1rem', color: '#38bdf8' }} />
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', margin: '0 0 0.5rem 0' }}>
            No Pending Unblock Appeals
          </h3>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            All moderation appeals have been reviewed and resolved.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {appeals.map((appeal) => {
            const isBusy = processingId === appeal.id;
            return (
              <div
                key={appeal.id}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.25rem'
                }}
              >
                {/* User & Ban Info Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ padding: '0.625rem', borderRadius: '10px', backgroundColor: '#ef444420', color: '#f87171' }}>
                      <User size={22} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                        {appeal.alias}
                      </h4>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Telegram ID: {appeal.telegramId} • ID: {appeal.userId}
                      </span>
                    </div>
                  </div>

                  {/* Sub-scores Badges */}
                  {appeal.subscores && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        FC: {appeal.subscores.fc}
                      </span>
                      <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        LR: {appeal.subscores.lr}
                      </span>
                      <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        GRA: {appeal.subscores.gra}
                      </span>
                      <span style={{ padding: '0.25rem 0.625rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                        P: {appeal.subscores.p}
                      </span>
                    </div>
                  )}
                </div>

                {/* Ban Reason */}
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f87171', fontWeight: 700, marginBottom: '0.25rem' }}>
                    Ban Reason
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#f1f5f9' }}>
                    {appeal.banReason}
                  </div>
                </div>

                {/* Offense Logs (if present) */}
                {appeal.offenseLogs && appeal.offenseLogs.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                      <FileText size={14} /> Offense Violation Logs
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {appeal.offenseLogs.map((log, idx) => (
                        <li key={idx}>{log}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Appeal Statement */}
                <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px dashed #334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.35rem' }}>
                    <MessageSquare size={14} /> User Appeal Statement
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5, fontStyle: 'italic' }}>
                    "{appeal.appealText}"
                  </p>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', paddingTop: '0.5rem' }}>
                  <button
                    onClick={() => handleReject(appeal.id)}
                    disabled={isBusy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      backgroundColor: isBusy ? '#dc262640' : '#dc262620',
                      border: '1px solid #dc262660',
                      borderRadius: '8px',
                      color: '#f87171',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: isBusy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <X size={16} /> Reject Appeal
                  </button>

                  <button
                    onClick={() => handleApprove(appeal.id)}
                    disabled={isBusy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      backgroundColor: isBusy ? '#16a34a80' : '#16a34a',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      cursor: isBusy ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Check size={16} /> Approve Unblock
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
