import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
const stack: HTMLDialogElement[] = [];
let previousOverflow = '';
export function Dialog({ open = true, title, pending = false, onClose, children, className = '' }: {
  open?: boolean; title: string; pending?: boolean; onClose: () => void; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current, previous = document.activeElement as HTMLElement | null;
    if (stack.length === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    stack.push(dialog); dialog.showModal();
    const cancel = (event: Event) => { event.preventDefault(); if (stack.at(-1) === dialog && !pendingRef.current) closeRef.current(); };
    const focus = (event: KeyboardEvent) => {
      if (stack.at(-1) !== dialog || event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('cancel', cancel); dialog.addEventListener('keydown', focus);
    return () => {
      dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('keydown', focus); dialog.close();
      const index = stack.indexOf(dialog); if (index >= 0) stack.splice(index, 1);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus(); else stack.at(-1)?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} className={`admin-dialog ${className}`} aria-labelledby={id} aria-busy={pending} tabIndex={-1}>
    <h2 id={id} className="dialog-title">{title}</h2>{children}
  </dialog>, document.body);
}
