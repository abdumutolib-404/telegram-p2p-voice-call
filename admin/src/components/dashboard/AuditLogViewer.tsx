import { useState, useEffect, useCallback, useMemo } from 'react';
import type { AuditLogItem, SystemErrorLogEntry, AuditActionCategory } from '../../types';
import { adminApi } from '../../services/api';
import { PageHeader } from '../ui/PageHeader';
import { StatusBadge } from '../ui/StatusBadge';
import { DataTable } from '../ui/DataTable';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { EmptyState } from '../ui/EmptyState';
import {
  Search,
  RefreshCw,
  AlertTriangle,
  Clock,
  Shield,
  User,
  Copy,
  Check,
  X,
  Code2,
  Bug,
  Filter,
} from 'lucide-react';

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [errors, setErrors] = useState<SystemErrorLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'audit' | 'errors'>('audit');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<AuditActionCategory>('ALL');
  const [timeRange, setTimeRange] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inspector Modal State
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMsg(null);
    try {
      const [logsData, errorsData] = await Promise.all([
        adminApi.getAuditLogs().catch(() => []),
        adminApi
          .getErrors(50)
          .then((res) => {
            if (res && Array.isArray(res.recentErrors)) return res.recentErrors;
            if (res && Array.isArray(res.errors)) return res.errors;
            return [];
          })
          .catch(() => []),
      ]);

      setLogs(Array.isArray(logsData) ? logsData : []);
      setErrors(Array.isArray(errorsData) ? errorsData : []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch audit logs and telemetry errors.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActionCategory = (action: string): AuditActionCategory => {
    const act = (action || '').toUpperCase();
    if (act.includes('BAN') || act.includes('BLOCK') || act.includes('WARN') || act.includes('MODERATION') || act.includes('RESET')) return 'BANS';
    if (act.includes('PLAN') || act.includes('LIMIT') || act.includes('RETENTION')) return 'PLANS';
    if (act.includes('APPEAL')) return 'APPEALS';
    if (act.includes('CONTEST') || act.includes('CHAMPIONSHIP') || act.includes('PRIZE')) return 'CONTESTS';
    if (act.includes('PAYMENT') || act.includes('REFUND') || act.includes('STARS') || act.includes('UZS')) return 'REFUNDS';
    if (act.includes('LOGIN') || act.includes('OTP') || act.includes('AUTH') || act.includes('LOGOUT')) return 'LOGINS';
    return 'ALL';
  };

  const getActionBadgeVariant = (action: string): 'danger' | 'warning' | 'info' | 'success' | 'gold' | 'neutral' => {
    const cat = getActionCategory(action);
    switch (cat) {
      case 'BANS':
        return 'danger';
      case 'PLANS':
        return 'info';
      case 'APPEALS':
        return 'warning';
      case 'CONTESTS':
        return 'gold';
      case 'REFUNDS':
        return 'warning';
      case 'LOGINS':
        return 'success';
      default:
        return 'neutral';
    }
  };

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Category Filter
      if (categoryFilter !== 'ALL') {
        const cat = getActionCategory(log.action);
        if (cat !== categoryFilter) return false;
      }

      // Time Range Filter
      if (timeRange !== 'all' && log.createdAt) {
        const logDate = new Date(log.createdAt).getTime();
        const now = Date.now();
        const days = (now - logDate) / (1000 * 60 * 60 * 24);
        if (timeRange === 'today' && days > 1) return false;
        if (timeRange === '7d' && days > 7) return false;
        if (timeRange === '30d' && days > 30) return false;
      }

      // Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchTarget = (log.targetId || '').toLowerCase().includes(q);
        const matchAdmin = (log.adminId || '').toLowerCase().includes(q);
        const matchReason = (log.reason || '').toLowerCase().includes(q);
        const matchBefore = (log.beforeState || '').toLowerCase().includes(q);
        const matchAfter = (log.afterState || '').toLowerCase().includes(q);
        return matchAction || matchTarget || matchAdmin || matchReason || matchBefore || matchAfter;
      }

      return true;
    });
  }, [logs, categoryFilter, timeRange, searchQuery]);

  // Filtered Errors
  const filteredErrors = useMemo(() => {
    if (!searchQuery.trim()) return errors;
    const q = searchQuery.toLowerCase();
    return errors.filter(
      (e) =>
        (e.message || '').toLowerCase().includes(q) ||
        (e.requestId || '').toLowerCase().includes(q) ||
        (e.service || '').toLowerCase().includes(q) ||
        (e.event || '').toLowerCase().includes(q)
    );
  }, [errors, searchQuery]);

  const formatJson = (raw: string | null | undefined): string => {
    if (!raw) return '(None / Initial)';
    try {
      const parsed = JSON.parse(raw);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(raw);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <PageHeader
        title="Audit Trail & System Telemetry"
        description="Immutable administrative activity logs, before/after JSON diffs, and live server error telemetry"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={fetchData}
              disabled={isRefreshing}
              className="btn-secondary"
              style={{ fontSize: '0.825rem' }}
            >
              <RefreshCw size={14} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Error Alert */}
      {errorMsg && (
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
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Tabs: Audit Trail vs System Errors */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid var(--border-card)',
          paddingBottom: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              background: activeTab === 'audit' ? 'var(--primary-bg)' : 'transparent',
              border: activeTab === 'audit' ? '1px solid var(--primary-border)' : '1px solid transparent',
              color: activeTab === 'audit' ? '#FFFFFF' : 'var(--text-secondary)',
              borderRadius: '6px',
              padding: '0.45rem 0.85rem',
              fontWeight: activeTab === 'audit' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Shield size={15} />
            <span>Administrative Audit Log</span>
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
              {logs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('errors')}
            style={{
              background: activeTab === 'errors' ? 'var(--danger-bg)' : 'transparent',
              border: activeTab === 'errors' ? '1px solid var(--danger-border)' : '1px solid transparent',
              color: activeTab === 'errors' ? 'var(--danger-text)' : 'var(--text-secondary)',
              borderRadius: '6px',
              padding: '0.45rem 0.85rem',
              fontWeight: activeTab === 'errors' ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Bug size={15} />
            <span>System Error Tracker</span>
            {errors.length > 0 && (
              <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                {errors.length}
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder={activeTab === 'audit' ? 'Search actions, IDs, payloads...' : 'Search errors, requestId...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-modern"
            style={{ width: '100%', paddingLeft: '32px', fontSize: '0.8rem', height: '34px' }}
          />
        </div>
      </div>

      {activeTab === 'audit' && (
        <>
          {/* Action Filter Pills & Time Filter */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px' }}>
                <Filter size={13} /> Filter:
              </span>
              {[
                { id: 'ALL', label: 'All Actions' },
                { id: 'BANS', label: 'Bans & Moderation' },
                { id: 'PLANS', label: 'Plans & Limits' },
                { id: 'APPEALS', label: 'Appeals' },
                { id: 'CONTESTS', label: 'Championships' },
                { id: 'REFUNDS', label: 'Payments & Refunds' },
                { id: 'LOGINS', label: 'Admin Auth' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setCategoryFilter(pill.id as AuditActionCategory)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: categoryFilter === pill.id ? 700 : 500,
                    cursor: 'pointer',
                    border: categoryFilter === pill.id ? '1px solid var(--primary)' : '1px solid var(--border-card)',
                    backgroundColor: categoryFilter === pill.id ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                    color: categoryFilter === pill.id ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.25rem',
                backgroundColor: 'var(--bg-surface-elevated)',
                padding: '0.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-card)',
              }}
            >
              {[
                { id: 'all', label: 'All Time' },
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTimeRange(t.id as 'all' | 'today' | '7d' | '30d')}
                  style={{
                    padding: '0.2rem 0.5rem',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: timeRange === t.id ? 700 : 500,
                    cursor: 'pointer',
                    background: timeRange === t.id ? 'var(--primary)' : 'transparent',
                    color: timeRange === t.id ? '#FFFFFF' : 'var(--text-secondary)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audit Log Table */}
          {isLoading ? (
            <LoadingSkeleton message="Loading audit trail records..." minHeight="300px" />
          ) : filteredLogs.length === 0 ? (
            <EmptyState
              title="No Audit Records Found"
              description="No administrative actions match the active category, search query, or date range filter."
              icon={<Shield size={28} color="var(--text-muted)" />}
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Administrator</th>
                  <th>Target ID</th>
                  <th>Reason / Context</th>
                  <th style={{ textAlign: 'right' }}>Payload Diff</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const hasPayload = Boolean(log.beforeState || log.afterState);
                  const badgeVariant = getActionBadgeVariant(log.action);
                  const formattedDate = log.createdAt
                    ? new Date(log.createdAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '—';

                  return (
                    <tr
                      key={log.id}
                      style={{ cursor: hasPayload ? 'pointer' : 'default' }}
                      onClick={() => hasPayload && setSelectedLog(log)}
                    >
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={12} color="var(--text-muted)" />
                          <span className="num-tabular">{formattedDate}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge variant={badgeVariant} label={log.action} size="sm" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={13} color="var(--text-muted)" />
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.775rem' }}>
                            {log.adminId || 'system'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {log.targetId ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span
                              style={{
                                fontFamily: 'var(--mono)',
                                fontSize: '0.775rem',
                                color: 'var(--primary-light)',
                              }}
                            >
                              {log.targetId.length > 16 ? `${log.targetId.slice(0, 12)}...` : log.targetId}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(log.targetId!, log.id);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '2px',
                              }}
                              title="Copy Target ID"
                            >
                              {copiedId === log.id ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.775rem' }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          maxWidth: '280px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {log.reason || '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {hasPayload ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.725rem', gap: '4px' }}
                          >
                            <Code2 size={13} />
                            <span>Inspect Diff</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>No Diff</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {/* System Error Tracker Panel */}
      {activeTab === 'errors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredErrors.length === 0 ? (
            <EmptyState
              title="Zero System Errors Recorded"
              description="The structured logging buffer contains 0 runtime errors or warnings."
              icon={<Check size={28} color="var(--success)" />}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {filteredErrors.map((errItem, idx) => (
                <div
                  key={idx}
                  className="glass-card"
                  style={{
                    padding: '0.875rem 1.125rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    borderColor: 'var(--danger-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <StatusBadge
                        variant="danger"
                        label={String(errItem.levelName || errItem.level || 'ERROR').toUpperCase()}
                        size="sm"
                      />
                      {errItem.service && (
                        <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                          svc: {errItem.service}
                        </span>
                      )}
                      {errItem.requestId && (
                        <span
                          onClick={() => copyToClipboard(errItem.requestId!, `req-${idx}`)}
                          style={{
                            fontFamily: 'var(--mono)',
                            fontSize: '0.7rem',
                            color: 'var(--primary-light)',
                            background: 'var(--primary-bg)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                          }}
                          title="Click to copy Request ID"
                        >
                          {copiedId === `req-${idx}` ? <Check size={11} color="var(--success)" /> : <Copy size={11} />}
                          {errItem.requestId}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} className="num-tabular">
                      {errItem.timestamp ? new Date(errItem.timestamp).toLocaleTimeString() : '—'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--mono)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {errItem.message}
                  </div>
                  {errItem.error && (
                    <pre
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-card)',
                        fontSize: '0.75rem',
                        fontFamily: 'var(--mono)',
                        color: 'var(--danger-text)',
                        margin: 0,
                        overflowX: 'auto',
                      }}
                    >
                      {typeof errItem.error === 'object' ? JSON.stringify(errItem.error, null, 2) : String(errItem.error)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* JSON Diff Inspector Modal */}
      {selectedLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(7, 10, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '840px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0B1020',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.125rem 1.5rem',
                borderBottom: '1px solid var(--border-card)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Code2 size={20} color="var(--primary-light)" />
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Audit Action State Inspector
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Action: <strong>{selectedLog.action}</strong> • Target: {selectedLog.targetId || 'N/A'} • Admin:{' '}
                    {selectedLog.adminId}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body: Side by Side Diff */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: window.innerWidth < 640 ? '1fr' : '1fr 1fr',
                gap: '1rem',
              }}
            >
              {/* Before State */}
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--danger-text)',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>Before Mutation</span>
                  {selectedLog.beforeState && (
                    <button
                      onClick={() => copyToClipboard(selectedLog.beforeState!, 'before-state')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                    >
                      {copiedId === 'before-state' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-card)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text-secondary)',
                    maxHeight: '340px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  {formatJson(selectedLog.beforeState)}
                </pre>
              </div>

              {/* After State */}
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--success-text)',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>After Mutation</span>
                  {selectedLog.afterState && (
                    <button
                      onClick={() => copyToClipboard(selectedLog.afterState!, 'after-state')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                    >
                      {copiedId === 'after-state' ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>
                <pre
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-card)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text-primary)',
                    maxHeight: '340px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    margin: 0,
                  }}
                >
                  {formatJson(selectedLog.afterState)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.875rem 1.5rem',
                borderTop: '1px solid var(--border-card)',
                backgroundColor: 'var(--bg-surface-elevated)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Reason / Note: {selectedLog.reason || 'No specific admin note recorded.'}
              </span>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn-secondary"
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
