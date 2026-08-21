import React from 'react';

export type StatusBadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'gold'
  | 'neutral';

interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  label: string;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  style?: React.CSSProperties;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = 'neutral',
  label,
  dot = true,
  size = 'md',
  className = '',
  style = {},
}) => {
  const variantClass = `badge-${variant}`;
  const sizeStyle = size === 'sm' ? { fontSize: '0.7rem', padding: '0.15rem 0.5rem' } : {};

  return (
    <span className={`badge ${variantClass} ${className}`} style={{ ...sizeStyle, ...style }}>
      {dot && <span className="dot" style={{ backgroundColor: 'currentColor' }} />}
      <span>{label}</span>
    </span>
  );
};
