import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string | React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon,
  badge,
  onClick,
  style = {},
}) => {
  return (
    <div
      className="metric-card"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } } : undefined}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        minHeight: '104px',
        ...style,
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
          <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0' }}>
            {label}
          </span>
          {icon && (
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {icon}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div className="num-tabular" style={{ fontSize: value === 'Unavailable' ? '1rem' : '1.65rem', fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {value}
          </div>
          {badge && <div>{badge}</div>}
        </div>
      </div>

      {subValue && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.625rem' }}>
          {subValue}
        </div>
      )}
    </div>
  );
};
