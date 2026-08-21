import React from 'react';

interface DataTableProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const DataTable: React.FC<DataTableProps> = ({
  children,
  className = '',
  style = {},
}) => {
  return (
    <div className={`table-container ${className}`} style={style}>
      <table className="table-modern">
        {children}
      </table>
    </div>
  );
};
