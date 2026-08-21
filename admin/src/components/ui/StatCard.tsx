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
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: '120px',
        ...style,
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {label}
          </span>
          {icon && (
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {icon}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            {value}
          </div>
          {badge && <div>{badge}</div>}
        </div>
      </div>

      {subValue && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {subValue}
        </div>
      )}
    </div>
  );
};
