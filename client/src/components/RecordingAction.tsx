import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Send } from 'lucide-react';
import { PendingIcon } from './CopyLink';

export type RecordingDeliveryStatus = 'QUEUED' | 'SENT' | 'UNCONFIRMED' | 'FAILED';

export function RecordingAction({ status, state, busy, index, onSend }: {
  status?: RecordingDeliveryStatus; state: 'idle' | 'pending' | 'success' | 'error';
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
  const unconfirmed = status === 'UNCONFIRMED';
  const failed = status === 'FAILED';
  const pending = state === 'pending' || queued;
  const suffix = index === undefined ? '' : ` ${index + 1}`;
  return <span className="audio-action">
    <button type="button" className="secondary-button" aria-label={unconfirmed ? `Check audio${suffix} delivery status` : failed ? `Retry audio${suffix} delivery` : `Send audio${suffix} to Telegram`} aria-busy={pending} data-state={state} disabled={busy || pending || receipt} onClick={onSend}>
      {pending ? <PendingIcon /> : receipt ? <Check size={16} className="draw-check" aria-hidden="true" /> : unconfirmed || failed ? <AlertTriangle size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
      {queued ? 'Queued for Telegram' : pending ? unconfirmed ? 'Checking…' : 'Sending…' : receipt ? 'Sent to Telegram' : unconfirmed ? `Check delivery status${suffix}` : failed ? `Retry delivery${suffix}` : `Send to Telegram${suffix}`}
    </button>
    {(popover || queued) && <span className="audio-delivery-note" role="status">{queued ? 'Queued · awaiting Telegram' : <><Check size={14} aria-hidden="true" /> Sent</>}</span>}
    {(unconfirmed || failed) && <span className="audio-delivery-warning" role="status">{unconfirmed ? 'We couldn’t confirm delivery. Check your Telegram chat for this audio.' : 'Telegram rejected the delivery. Check the bot chat, then retry.'}</span>}
  </span>;
}
