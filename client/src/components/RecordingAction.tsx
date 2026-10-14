import { useEffect, useState } from 'react';
import { Check, Send } from 'lucide-react';
import { PendingIcon } from './CopyLink';

export function RecordingAction({ status, state, busy, index, onSend }: {
  status?: 'QUEUED' | 'SENT'; state: 'idle' | 'pending' | 'success' | 'error';
  busy: boolean; index?: number; onSend: () => void;
}) {
  const [receipt, setReceipt] = useState(false), [popover, setPopover] = useState(false);
  useEffect(() => {
    if (status !== 'SENT' || state !== 'success') { setReceipt(false); setPopover(false); return; }
    setReceipt(true); setPopover(true);
    const noteTimer = setTimeout(() => setPopover(false), 1800);
    const buttonTimer = setTimeout(() => setReceipt(false), 1900);
    return () => { clearTimeout(noteTimer); clearTimeout(buttonTimer); };
  }, [status, state]);
  const queued = status === 'QUEUED';
  const pending = state === 'pending' || queued;
  const suffix = index === undefined ? '' : ` ${index + 1}`;
  return <span className="audio-action">
    <button type="button" className="secondary-button" aria-label={`Send audio${suffix} to Telegram`} aria-busy={pending} data-state={state} disabled={busy || pending || receipt} onClick={onSend}>
      {pending ? <PendingIcon /> : receipt ? <Check size={16} className="draw-check" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
      {queued ? 'Queued for Telegram' : pending ? 'Sending…' : receipt ? 'Sent to Telegram' : `Send to Telegram${suffix}`}
    </button>
    {(popover || queued) && <span className="audio-delivery-note" role="status">{queued ? 'Queued · awaiting Telegram' : <><Check size={14} aria-hidden="true" /> Sent</>}</span>}
  </span>;
}
