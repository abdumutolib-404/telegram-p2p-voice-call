import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
  style = {},
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'nowrap',
        gap: '1rem',
        marginBottom: '0.25rem',
        ...style,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 650,
              margin: 0,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p
            style={{
              margin: '0.35rem 0 0 0',
              color: 'var(--text-secondary)',
              fontSize: '0.875rem',
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  );
};
