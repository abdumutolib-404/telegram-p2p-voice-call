import React from 'react';

interface DataTableProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  children,
  className = '',
  style = {},
  label = 'Records table',
}) => {
  return (
    <div className={`table-container ${className}`} style={style} role="region" aria-label={label} tabIndex={0}>
      <table className="table-modern">
        {children}
      </table>
    </div>
  );
};
