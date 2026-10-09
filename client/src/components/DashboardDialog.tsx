import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalDialog } from '../hooks/useModalDialog';

export function DashboardDialog({ title, pending = false, onClose, children }: {
  title: string; pending?: boolean; onClose: () => void; children: ReactNode;
}) {
  const close = () => { if (!pending) onClose(); };
  const ref = useModalDialog(true, close);
  return <div className="dashboard-modal-overlay" onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={ref} className="dashboard-modal" role="dialog" aria-modal="true" aria-label={title} aria-busy={pending} tabIndex={-1}>
      <button type="button" className="modal-close" aria-label="Close dialog" disabled={pending} onClick={close}><X size={18} aria-hidden="true" /></button>
      <h2>{title}</h2>{children}
    </div>
  </div>;
}
