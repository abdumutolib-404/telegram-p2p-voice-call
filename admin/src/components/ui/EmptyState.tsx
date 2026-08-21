import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  style = {},
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '3.5rem 1.5rem',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {icon && (
        <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', opacity: 0.7 }}>
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 0.35rem 0',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            maxWidth: '420px',
            margin: '0 auto',
            lineHeight: 1.4,
          }}
        >
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '1.25rem' }}>{action}</div>}
    </div>
  );
};
