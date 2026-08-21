import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingSkeletonProps {
  message?: string;
  rows?: number;
  minHeight?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  message = 'Loading operational data...',
  rows = 4,
  minHeight = '240px',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: '2rem',
        gap: '1rem',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <RefreshCw
          size={20}
          style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-light)' }}
        />
        <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{message}</span>
      </div>

      <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '0.5rem', opacity: 0.4 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              height: '14px',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '4px',
              width: `${100 - i * 12}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
