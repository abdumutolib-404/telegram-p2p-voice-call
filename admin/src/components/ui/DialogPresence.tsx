import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DialogClosingContext } from '../../hooks/useDialogClosing';

/** Keep a dismissed native dialog mounted for its inert exit animation. */
export function DialogPresence({ children }: { children?: ReactNode }) {
  const open = Boolean(children);
  const previous = useRef<ReactNode>(null);
  const [present, setPresent] = useState(open);
  useLayoutEffect(() => { if (open) previous.current = children; }, [open, children]);
  useLayoutEffect(() => {
    if (open) { setPresent(true); return; }
    const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
    if (!duration) { setPresent(false); previous.current = null; return; }
    const timer = setTimeout(() => { setPresent(false); previous.current = null; }, duration);
    return () => clearTimeout(timer);
  }, [open]);
  if (!open && !present) return null;
  return <DialogClosingContext.Provider value={!open}>{open ? children : previous.current}</DialogClosingContext.Provider>;
}
