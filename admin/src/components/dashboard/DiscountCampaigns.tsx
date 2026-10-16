import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { isPracticeCatalog, quotePracticePack, type PracticeCatalog } from '../../../../server/src/contracts/practicePacks';
import { isChannelOffer, type AdminChannelOffer } from '../../../../server/src/contracts/channelOffers';

export function DiscountCampaigns({open,onClose}:{open:boolean;onClose:()=>void;plans?:unknown}) {
  const [calls,setCalls]=useState(''),[recordings,setRecordings]=useState(''),[retention,setRetention]=useState(''),[minutes,setMinutes]=useState<15|30>(15);
  const [percent,setPercent]=useState(''),[count,setCount]=useState(''),[period,setPeriod]=useState(''),[unit,setUnit]=useState('hours');
  const [catalog,setCatalog]=useState<PracticeCatalog|null>(null),[campaigns,setCampaigns]=useState<AdminChannelOffer[]>([]);
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[listError,setListError]=useState(''),[created,setCreated]=useState<string|null>(null),[refresh,setRefresh]=useState(0),[channel,setChannel]=useState('');
  const [messageIds,setMessageIds]=useState<Record<string,string>>({});
  const busy=useRef(false),submission=useRef<{fingerprint:string;id:string}|null>(null);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();let timer:number|undefined;
    const load=async()=>{
      const results=await Promise.allSettled([
        adminFetch<{packs:unknown}>('/api/admin/credit-pricing',{signal:controller.signal}),
        adminFetch<{campaigns:unknown[]}>('/api/admin/pack-offers',{signal:controller.signal}),
      ]);
      if(controller.signal.aborted)return;
      const prices=results[0],history=results[1];
      if(prices.status==='fulfilled'&&isPracticeCatalog(prices.value.packs))setCatalog(prices.value.packs);
      else setError('Published pack prices could not be loaded. Retry before creating an offer.');
      if(history.status==='fulfilled'&&Array.isArray(history.value.campaigns)&&history.value.campaigns.every(isChannelOffer)){setCampaigns(history.value.campaigns as AdminChannelOffer[]);setListError('');}
      else setListError('Campaign history is unavailable.');
      timer=window.setTimeout(()=>void load(),5000);
    };
    void load();return()=>{controller.abort();clearTimeout(timer);};
  },[open,refresh]);
  let preview:ReturnType<typeof quotePracticePack>|null=null;
  try{if(catalog&&calls!==''&&recordings!==''&&retention!==''&&percent!==''&&Number(percent)>0)preview=quotePracticePack({calls:Number(calls),recordings:Number(recordings),retention:retention==='yes',minutes},catalog.prices,Number(percent));}catch{/* The form explains invalid selections on submit. */}
  async function create(event:React.FormEvent) {
    event.preventDefault();if(busy.current||created)return;
    const validMinutes=Number(period)*({minutes:1,hours:60,days:1440}[unit]??0),maximumClaims=Number(count);
    if(!preview||!catalog||!catalog.salesEnabled||count===''||!Number.isSafeInteger(maximumClaims)||maximumClaims<1||period===''||!Number.isInteger(validMinutes)||validMinutes<1||validMinutes>2820){setError('Complete every field. Recordings cannot exceed calls. Choose a valid period from 1 minute to 47 hours.');return;}
    const input={...preview.pack,percent:preview.discountPercent,maximumClaims,validMinutes,revision:catalog.revision},fingerprint=JSON.stringify(input);
    if(submission.current?.fingerprint!==fingerprint)submission.current={fingerprint,id:crypto.randomUUID()};
    busy.current=true;setPending(true);setError('');
    try{const result=await adminFetch<{id:string}>('/api/admin/pack-offers',{method:'POST',body:JSON.stringify({...input,requestId:submission.current.id})});setCreated(result.id);setRefresh(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'Publication could not be confirmed. Retry the same submission.');}
    finally{busy.current=false;setPending(false);}
  }
  async function recover(id:string,retry=false) {
    if(busy.current)return;busy.current=true;setPending(true);setError('');
    try{await adminFetch(`/api/admin/pack-offers/${id}/${retry?'retry':'recover'}`,{method:'POST',body:JSON.stringify(retry?{}:{messageId:Number(messageIds[id])})});setRefresh(n=>n+1);}
    catch(e){setError(e instanceof Error?e.message:'Publication recovery failed.');}
    finally{busy.current=false;setPending(false);}
  }
  const createdCampaign=campaigns.find(c=>c.id===created);
  return <Dialog open={open} title="Discount" pending={pending} onClose={onClose} className="discount-dialog">
    <p className="field-help">Build a public pack for <a href="https://t.me/pairtalk" target="_blank" rel="noreferrer">@pairtalk</a>. Each person can purchase it once. The post updates as purchases complete.</p>
    <form onSubmit={create}>
      <fieldset disabled={pending||!!created} className="discount-fields">
        <div><label className="field-label" htmlFor="offer-calls">Calls</label><input id="offer-calls" className="input-modern" type="number" min="1" step="1" required value={calls} onChange={e=>setCalls(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="offer-recordings">Recordings</label><input id="offer-recordings" className="input-modern" type="number" min="0" step="1" required value={recordings} onChange={e=>setRecordings(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="offer-retention">30-day retention</label><select id="offer-retention" className="input-modern" required value={retention} onChange={e=>setRetention(e.target.value)}><option value="">Choose retention</option><option value="yes">Included for every recording</option><option value="no">Not included</option></select></div>
        <div><label className="field-label" htmlFor="offer-duration">Duration per call</label><select id="offer-duration" className="input-modern" required value={minutes} onChange={e=>setMinutes(Number(e.target.value) as 15|30)}><option value="15">15 minutes</option><option value="30">30 minutes · twice the service price</option></select></div>
        <div><label className="field-label" htmlFor="offer-percent">Discount (%)</label><input id="offer-percent" className="input-modern" type="number" min="0.01" max="100" step="0.01" required value={percent} onChange={e=>setPercent(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="offer-people">Number of people</label><input id="offer-people" className="input-modern" type="number" min="1" step="1" required value={count} onChange={e=>setCount(e.target.value)}/></div>
        <div><label className="field-label" htmlFor="offer-period">Limited offer</label><div className="discount-period"><input id="offer-period" className="input-modern" type="number" min="1" step="1" required value={period} onChange={e=>setPeriod(e.target.value)}/><select className="input-modern" aria-label="Offer period unit" value={unit} onChange={e=>setUnit(e.target.value)}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></div><p className="field-help">Up to 47 hours. Telegram only permits automatic message deletion within 48 hours.</p></div>
      </fieldset>
      {preview&&<div className="discount-preview" aria-label="Discounted pack preview"><strong>{preview.discountPercent}% off this pack</strong><p><s>{preview.originalUzs.toLocaleString('en-US')} UZS</s> → <b>{preview.uzs.toLocaleString('en-US')} UZS</b></p><p><s>{preview.originalStars} Stars</s> → <b>{preview.stars} Stars</b></p><p className="field-help">UZS and Stars are discounted separately and rounded up. Retention matches all selected recordings.{preview.free?' This is a free claim; no invoice is created.':''}</p>{preview.recordingUnits>0&&catalog&&Number(count)*preview.recordingUnits*16>catalog.recordingMinutesAvailable&&<p className="field-help">The selected recording packs exceed current recording capacity. Individual checkouts will stop when capacity is exhausted.</p>}</div>}
      {error&&<p role="alert" className="inline-error">{error}</p>}
      {created&&<p role="status">{createdCampaign?.messageState==='PUBLISHED'?'Offer published in @pairtalk.':createdCampaign?.failure||'Publication queued. The offer becomes claimable after Telegram confirms the post.'}</p>}
      <div className="discount-actions"><button type="button" className="btn-secondary" disabled={pending} onClick={onClose}>Close</button>{created?<button type="button" className="btn-primary" onClick={()=>{submission.current=null;setCreated(null);setError('');}}>New campaign</button>:<button type="submit" className="btn-primary" disabled={pending||!catalog||!catalog.salesEnabled}>{pending?'Creating…':'Publish channel offer'}</button>}</div>
    </form>
    <button type="button" className="btn-secondary" disabled={pending} onClick={()=>{setChannel('Checking channel…');void adminFetch<{ready:boolean;botUsername:string}>('/api/admin/pack-offers/channel').then(result=>setChannel(`@${result.botUsername} can post in @pairtalk.`)).catch(e=>setChannel(e instanceof Error?e.message:'Channel check failed.'));}}>Check channel connection</button>{channel&&<p role="status" className="field-help">{channel}</p>}
    <section className="discount-history" aria-label="Recent channel offers"><h3>Recent campaigns</h3>{listError&&<p role="alert" className="inline-error">{listError}<button type="button" className="btn-secondary" onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}{campaigns.map(c=><article key={c.id}><strong>{c.percent}% off · {c.pack.calls} calls / {c.pack.recordings} recordings</strong><p>{c.remaining}/{c.maximumClaims} left · {c.held} reserved · {c.status.toLowerCase().replaceAll('_',' ')}</p><p className="field-help">Expires {new Date(c.expiresAt).toLocaleString(undefined,{timeZoneName:'short'})} · Channel: {c.messageState.toLowerCase().replaceAll('_',' ')}</p>{c.telegramMessageId&&<a href={`https://t.me/pairtalk/${c.telegramMessageId}`} target="_blank" rel="noreferrer">Open channel post ↗</a>}{c.failure&&<p role="status" className="field-help">{c.failure}</p>}{['UNCONFIRMED','FAILED'].includes(c.messageState)&&<div><label className="field-label" htmlFor={`message-${c.id}`}>Existing channel message ID</label><input id={`message-${c.id}`} className="input-modern" type="number" min="1" step="1" value={messageIds[c.id]??''} onChange={e=>setMessageIds(previous=>({...previous,[c.id]:e.target.value}))}/><button type="button" className="btn-secondary" disabled={pending||!Number.isSafeInteger(Number(messageIds[c.id]))||Number(messageIds[c.id])<1} onClick={()=>void recover(c.id)}>Link existing post</button>{c.messageState==='FAILED'&&!c.telegramMessageId&&<button type="button" className="btn-secondary" disabled={pending} onClick={()=>void recover(c.id,true)}>Retry rejected publication</button>}</div>}</article>)}</section>
  </Dialog>;
}
