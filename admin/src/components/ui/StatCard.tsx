import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string | React.ReactNode;
  icon?: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  badge?: React.ReactNode;
  glowColor?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon,
  iconBg = 'rgba(99, 102, 241, 0.12)',
  iconColor = 'var(--primary-light)',
  badge,
  glowColor,
  onClick,
  style = {},
}) => {
  return (
    <div
      className="metric-card"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {glowColor && (
        <div
          className="metric-card-glow"
          style={{ background: glowColor }}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {icon && (
          <div
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              backgroundColor: iconBg,
              color: iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div className="num-tabular" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {value}
        </div>
        {badge && <div>{badge}</div>}
      </div>

      {subValue && (
        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
          {subValue}
        </div>
      )}
    </div>
  );
};
