import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import type { PlansResponse } from '../../types';
import { discountedPrice } from '../../../../server/src/contracts/discountPricing';

interface Campaign { id:string;planName:string;percent:number;recipientCount:number;claimed:number;expiresAt:string }
export function DiscountCampaigns({open,onClose,plans}:{open:boolean;onClose:()=>void;plans:PlansResponse|null}){
  const [plan,setPlan]=useState(''),[percent,setPercent]=useState(''),[count,setCount]=useState(''),[period,setPeriod]=useState(''),[unit,setUnit]=useState('hours');
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState<{recipientCount:number;expiresAt:string;starsPrice:number;uzsPrice:number}|null>(null);
  const [campaigns,setCampaigns]=useState<Campaign[]>([]),[listError,setListError]=useState(''),[refresh,setRefresh]=useState(0);
  const busy=useRef(false),submission=useRef<{fingerprint:string;id:string}|null>(null);
  useEffect(()=>{
    if(!open)return;const controller=new AbortController();setListError('');
    void adminFetch<{campaigns:Campaign[]}>('/api/admin/plans/discounts',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setCampaigns(result.campaigns);}).catch(e=>{if(!controller.signal.aborted)setListError(e instanceof Error?e.message:'Campaigns could not be loaded.');});
    return()=>controller.abort();
  },[open,refresh]);
  const config=plans?.[plan as keyof PlansResponse],discount=Number(percent),validDiscount=percent!==''&&Number.isFinite(discount)&&discount>=0.01&&discount<=100;
  const originalStars=Number(config?.starsPrice),originalUzs=Number(config?.uzsPrice);
  async function create(event:React.FormEvent){
    event.preventDefault();if(busy.current||created)return;
    const minutes=Number(period)*({minutes:1,hours:60,days:1440}[unit]??0),recipients=Number(count);
    if(!config?.active||!validDiscount||!Number.isInteger(recipients)||recipients<1||recipients>10000||period===''||!Number.isInteger(minutes)||minutes<1||minutes>525600){setError('Complete all four fields within the displayed limits.');return;}
    const input={plan,percent:discount,recipientCount:recipients,validMinutes:minutes},fingerprint=JSON.stringify(input);
    if(submission.current?.fingerprint!==fingerprint)submission.current={fingerprint,id:crypto.randomUUID()};
    busy.current=true;setPending(true);setError('');
    try{const result=await adminFetch<{recipientCount:number;expiresAt:string;starsPrice:number;uzsPrice:number}>('/api/admin/plans/discounts',{method:'POST',body:JSON.stringify({...input,requestId:submission.current.id})});setCreated(result);setRefresh(value=>value+1);}
    catch(e){setError(e instanceof Error?e.message:'Campaign creation could not be confirmed. Retry to check the same submission.');}
    finally{busy.current=false;setPending(false);}
  }
  return <Dialog open={open} title="Discount" pending={pending} onClose={onClose} className="discount-dialog">
    <p className="field-help">Select random eligible users once per campaign. Each gets one personal message and can claim the offer once.</p>
    <form onSubmit={create}>
      <fieldset disabled={pending||!!created} className="discount-fields">
        <div><label className="field-label" htmlFor="discount-plan">Plan</label><select id="discount-plan" className="input-modern" required value={plan} onChange={e=>setPlan(e.target.value)}><option value="">Choose a plan</option>{(['PLUS','PRO','BOSS'] as const).filter(tier=>plans?.[tier]?.active).map(tier=><option key={tier} value={tier}>{plans![tier].name}</option>)}</select></div>
        <div><label className="field-label" htmlFor="discount-percent">Discount (%)</label><input id="discount-percent" className="input-modern" type="number" required min="0.01" max="100" step="0.01" value={percent} onChange={e=>setPercent(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="discount-users">Number of users</label><input id="discount-users" className="input-modern" type="number" required min="1" max="10000" step="1" value={count} onChange={e=>setCount(e.target.value)}/><p className="field-help">1–10,000. The server requires enough eligible users.</p></div>
        <div><label className="field-label" htmlFor="discount-period">Limited offer</label><div className="discount-period"><input id="discount-period" className="input-modern" type="number" required min="1" step="1" value={period} onChange={e=>setPeriod(e.target.value)}/><select className="input-modern" aria-label="Offer period unit" value={unit} onChange={e=>setUnit(e.target.value)}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></div><p className="field-help">Valid from creation, for up to 365 days.</p></div>
      </fieldset>
      {config&&validDiscount&&Number.isSafeInteger(originalStars)&&Number.isSafeInteger(originalUzs)&&<div className="discount-preview" aria-label="Discounted price preview"><strong>{discount}% off {config.name}</strong><p><s>{config.starsPrice} Stars</s> → <b>{discountedPrice(originalStars,discount)} Stars</b></p><p><s>{originalUzs.toLocaleString()} UZS</s> → <b>{discountedPrice(originalUzs,discount).toLocaleString()} UZS</b></p><p className="field-help">Prices use saved plans. Whole units are rounded up.{discount===100?' A 100% offer activates the plan without payment.':''}</p></div>}
      {error&&<p role="alert" className="inline-error">{error}</p>}
      {created&&<p role="status">Campaign created for {created.recipientCount} users at {created.starsPrice} Stars or {created.uzsPrice.toLocaleString()} UZS. One message per user is scheduled. Expires {new Date(created.expiresAt).toLocaleString(undefined,{timeZoneName:'short'})}.</p>}
      <div className="discount-actions"><button type="button" className="btn-secondary" disabled={pending} onClick={onClose}>Close</button>{created?<button type="button" className="btn-primary" onClick={()=>{submission.current=null;setCreated(null);setError('');}}>New campaign</button>:<button type="submit" className="btn-primary" disabled={pending||!plans}>{pending?'Creating…':'Create discount campaign'}</button>}</div>
    </form>
    <section className="discount-history" aria-label="Recent discount campaigns"><h3>Recent campaigns</h3>{listError&&<p role="alert" className="inline-error">{listError}<button type="button" className="btn-secondary" onClick={()=>setRefresh(value=>value+1)}>Retry</button></p>}{campaigns.map(campaign=><article key={campaign.id}><strong>{campaign.percent}% off {campaign.planName}</strong><p>{campaign.recipientCount} selected · {campaign.claimed} claimed</p><p className="field-help">Expires {new Date(campaign.expiresAt).toLocaleString(undefined,{timeZoneName:'short'})}</p></article>)}</section>
  </Dialog>;
}
