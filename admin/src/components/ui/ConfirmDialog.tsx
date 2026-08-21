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
        return <ShieldAlert size={20} color="var(--danger-text)" />;
      case 'warning':
        return <AlertTriangle size={20} color="var(--warning-text)" />;
      default:
        return <Info size={20} color="var(--info-text)" />;
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
        backgroundColor: 'rgba(7, 10, 18, 0.8)',
        backdropFilter: 'blur(8px)',
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
          boxShadow: 'var(--shadow-lg)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-card)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div
            style={{
              padding: '0.5rem',
              borderRadius: '8px',
              backgroundColor: severity === 'danger' ? 'var(--danger-bg)' : severity === 'warning' ? 'var(--warning-bg)' : 'var(--info-bg)',
              border: `1px solid ${severity === 'danger' ? 'var(--danger-border)' : severity === 'warning' ? 'var(--warning-border)' : 'var(--info-border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getIcon()}
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
            {title}
          </h3>
        </div>

        {affectedItem && (
          <div
            style={{
              padding: '0.625rem 0.875rem',
              backgroundColor: 'var(--bg-input)',
              borderRadius: '6px',
              border: '1px solid var(--border-input)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              marginBottom: '1rem',
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
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={getConfirmButtonClass()}
          >
            {isConfirming ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
