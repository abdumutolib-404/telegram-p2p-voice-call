import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { quotePracticePack, type PracticeCatalog, type PracticePack } from '../../../server/src/contracts/practicePacks';
import { publicSiteUrl } from '../services/dashboard';

export function PracticeCheckout({pack,catalog,busy,error,onClose,onPay,discountPercent=0,expiresAt,serverOffset=0,lockedCurrency,onCancelExisting}:{pack:PracticePack;catalog:PracticeCatalog;busy:boolean;error:string;onClose:()=>void;onPay:(currency:'XTR'|'UZS')=>void;discountPercent?:number;expiresAt?:string;serverOffset?:number;lockedCurrency?:'XTR'|'UZS';onCancelExisting?:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null),title=useId(),description=useId();
  const [accepted,setAccepted]=useState(false);
  const quote=quotePracticePack(pack,catalog.prices,discountPercent);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!expiresAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[expiresAt]);
  const expired=Boolean(expiresAt&&Date.parse(expiresAt)<=now+serverOffset);
  useEffect(()=>{
    const dialog=ref.current;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog?.showModal();
    return()=>{dialog?.close();document.body.style.overflow=previous;if(opener?.isConnected)opener.focus();};
  },[]);
  return createPortal(<dialog ref={ref} className="practice-checkout" aria-labelledby={title} aria-describedby={description} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')??[]).filter(element=>element.getClientRects().length);
    const first=controls[0],last=controls[controls.length-1];
    if(!first){event.preventDefault();ref.current?.focus();}
    else if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }} onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <button type="button" className="practice-checkout__close" onClick={onClose} disabled={busy} aria-label="Close checkout">×</button>
    <h2 id={title}>Review your purchase</h2>
    <p id={description}>{pack.calls.toLocaleString('en-US')} × {pack.minutes}-minute calls · {pack.recordings.toLocaleString('en-US')} recordings{pack.retention?' · 30-day retention':' · no extended retention'}</p>
    {discountPercent>0&&<p><b>{discountPercent}% channel offer</b><br/><s>{quote.originalUzs.toLocaleString('en-US')} UZS / {quote.originalStars} Stars</s>. One claim per person.</p>}
    <div className="practice-checkout__totals"><div><span>UZS</span><strong>{quote.uzs.toLocaleString('en-US')}</strong></div><div><span>Telegram Stars</span><strong>{quote.stars.toLocaleString('en-US')}</strong></div></div>
    <p className="credit-shop__note">{quote.free?'This is a free channel offer. No payment is collected. You can claim this campaign once.':'Stars opens Telegram’s official checkout. UZS queues payment instructions in your private bot chat and closes this Mini App. UZS purchases are added after admin approval of your receipt.'}</p>
    <label className="credit-shop__storage"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)} disabled={busy}/><span>I agree to the <a href={new URL('terms#payments',publicSiteUrl).toString()} target="_blank" rel="noreferrer">payment terms</a> and the 48-hour full unused-purchase refund rule. Purchases do not expire. Recording requires both partners’ consent.</span></label>
    {error&&<p role="alert" className="dashboard-alert">{error}</p>}
    {lockedCurrency&&<p className="credit-shop__note">This checkout uses {lockedCurrency==='XTR'?'Stars':'UZS'}. You can cancel an unpaid checkout before choosing another payment method.</p>}
    <div className="practice-checkout__actions">{quote.free?<button className="primary-button" disabled={!accepted||busy||expired} onClick={()=>onPay('XTR')}>Claim free offer</button>:<><button className="secondary-button" disabled={!accepted||busy||expired||lockedCurrency==='XTR'} onClick={()=>onPay('UZS')}>Pay {quote.uzs.toLocaleString('en-US')} UZS</button><button className="primary-button" disabled={!accepted||busy||expired||lockedCurrency==='UZS'} onClick={()=>onPay('XTR')}>Pay {quote.stars.toLocaleString('en-US')} Stars</button></>}</div>
    {onCancelExisting&&<button type="button" className="text-button" disabled={busy} onClick={onCancelExisting}>Cancel this unpaid checkout</button>}
    <p className="credit-shop__note" role="status">{expired?'This checkout has expired. Close it to see current packs.':busy?'Preparing your payment…':`Payment instructions expire in 30 minutes${expiresAt&&discountPercent>0?' or when this offer ends, whichever comes first':''}. Review the total before paying. Local Stars taxes and store prices may vary.`}</p>
  </dialog>,document.body);
}
