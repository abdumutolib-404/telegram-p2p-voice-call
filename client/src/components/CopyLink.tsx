import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';

export function PendingIcon({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="action-spinner" aria-hidden="true" />;
}

/** Keep a manual copy path available in older Telegram webviews. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const alive = useRef(true), inFlight = useRef(false);
  const currentValue = useRef(value);
  currentValue.current = value;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!inFlight.current) setState('idle'); }, [value]);
  async function copy() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('pending');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(value);
      } catch {
        if (!alive.current || currentValue.current !== value) return;
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
        const selection = window.getSelection();
        const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
        (buttonRef.current?.closest('[role="dialog"]') || document.body).append(field);
        try {
          field.select();
          if (!document.execCommand?.('copy')) throw new Error('Copy unavailable');
        } finally {
          field.remove();
          buttonRef.current?.focus({ preventScroll: true });
          selection?.removeAllRanges();
          ranges.forEach(range => selection?.addRange(range));
        }
      }
      if (alive.current && currentValue.current === value) setState('success');
    } catch { if (alive.current && currentValue.current === value) setState('error'); }
    finally { inFlight.current = false; if (alive.current && currentValue.current !== value) setState('idle'); }
  }
  return <span className="copy-control">
    <button ref={buttonRef} type="button" className="copy-button" aria-label={`${state === 'success' ? 'Copied' : 'Copy'} ${label}`} aria-busy={state === 'pending'} disabled={state === 'pending'} data-state={state} onClick={() => void copy()}>
      {state === 'pending' ? <PendingIcon /> : state === 'success' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span>{state === 'success' ? 'Copied' : state === 'pending' ? 'Copying…' : 'Copy'}</span>
    </button>
    <span className="sr-only" role="status">{state === 'success' ? `${label} copied.` : ''}</span>
    {state === 'error' && <span className="copy-fallback"><span role="alert">Copy is unavailable. Select the link below to copy it manually.</span><input aria-label={`${label} for manual copying`} readOnly value={value} onFocus={event => event.target.select()} /></span>}
  </span>;
}

export function LinkWithCopy({ url, label, children, className = '' }: { url: string; label: string; children?: ReactNode; className?: string }) {
  return <span className={`link-with-copy ${className}`}><a href={url} target="_blank" rel="noopener noreferrer">{children || label}</a><CopyButton value={url} label={label} /></span>;
}
