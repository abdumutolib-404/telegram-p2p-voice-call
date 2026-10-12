import { useEffect, useState } from 'react';
import { AlertTriangle, Heart } from 'lucide-react';

export function HistoryMark({ kind, acknowledged }: { kind: 'saved' | 'reported'; acknowledged: boolean }) {
  const [visible, setVisible] = useState(!acknowledged);
  useEffect(() => {
    if (!acknowledged || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(true), 460);
    return () => clearTimeout(timer);
  }, [acknowledged]);
  if (!visible) return null;
  const saved = kind === 'saved';
  return <details className={`history-mark mark--${kind} ${acknowledged ? 'is-new' : ''}`}>
    <summary aria-label={saved ? 'Saved partner' : 'Reported partner'}>
      {saved ? <Heart size={18} fill="currentColor" aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
    </summary>
    <span role="status">You {kind} this partner</span>
  </details>;
}
