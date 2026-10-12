import { useEffect, useId, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { DialogPresence } from './DialogPresence';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
interface ConfirmDialogProps {
  isOpen: boolean; title: string; message: string | ReactNode; affectedItem?: string;
  confirmLabel?: string; cancelLabel?: string; severity?: 'danger' | 'warning' | 'info';
  isConfirming?: boolean; onConfirm: (note: string) => void; onCancel: () => void;
  error?: string | null; auditNote?: boolean;
}
export function ConfirmDialog({isOpen,title,message,affectedItem,confirmLabel='Confirm action',cancelLabel='Cancel',severity='danger',isConfirming=false,onConfirm,onCancel,error,auditNote=false}: ConfirmDialogProps) {
  const [note,setNote]=useState(''); const noteId=useId();
  useEffect(()=>{if(isOpen)setNote('');},[isOpen,affectedItem,title]);
  const Icon=severity==='danger'?ShieldAlert:severity==='warning'?AlertTriangle:Info;
  return <DialogPresence>{isOpen && <Dialog title={title} onClose={onCancel} pending={isConfirming}>
    <p className="confirm-message"><Icon size={20} color={severity==='danger'?'var(--danger-text)':severity==='warning'?'var(--warning-text)':'var(--info-text)'} aria-hidden="true" /> {message}</p>
    {affectedItem&&<p className="confirm-target">Target: <code>{affectedItem}</code></p>}
    {auditNote&&<><label className="field-label" htmlFor={noteId}>Audit note <span className="field-help">(optional)</span></label><textarea id={noteId} className="input-modern" rows={3} maxLength={1000} disabled={isConfirming} value={note} onChange={event=>setNote(event.target.value)} /></>}
    {error&&<p role="alert" className="inline-error">{error}</p>}
    <div className="dialog-actions"><button type="button" className="btn-secondary" disabled={isConfirming} onClick={onCancel}>{cancelLabel}</button><button type="button" className={severity==='danger'?'btn-danger':severity==='warning'?'btn-secondary':'btn-primary'} disabled={isConfirming} onClick={()=>onConfirm(note.trim())}>{isConfirming?'Processing…':confirmLabel}</button></div>
  </Dialog>}</DialogPresence>;
}
