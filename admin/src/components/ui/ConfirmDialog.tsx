import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  affectedItem?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: 'danger' | 'warning' | 'info';
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  affectedItem,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  severity = 'danger',
  isConfirming = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (severity) {
      case 'danger':
        return <ShieldAlert size={22} color="#fb7185" />;
      case 'warning':
        return <AlertTriangle size={22} color="#fbbf24" />;
      default:
        return <Info size={22} color="#38bdf8" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (severity) {
      case 'danger':
        return 'btn-danger';
      case 'warning':
        return 'btn-secondary';
      default:
        return 'btn-primary';
    }
  };

  return (
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
          maxWidth: '440px',
          padding: '1.75rem',
          boxSizing: 'border-box',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '10px',
              backgroundColor: severity === 'danger' ? 'var(--danger-bg)' : severity === 'warning' ? 'var(--warning-bg)' : 'var(--info-bg)',
              border: `1px solid ${severity === 'danger' ? 'var(--danger-border)' : severity === 'warning' ? 'var(--warning-border)' : 'var(--info-border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getIcon()}
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {title}
          </h3>
        </div>

        {affectedItem && (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '6px',
              border: '1px solid var(--border-card)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '0.875rem',
            }}
          >
            Target: <code style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{affectedItem}</code>
          </div>
        )}

        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
          {message}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="btn-secondary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={getConfirmButtonClass()}
            style={{ padding: '0.5rem 1.125rem', fontSize: '0.85rem' }}
          >
            {isConfirming ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
