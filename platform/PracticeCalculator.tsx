import { useState } from 'react';
import { baseServiceStars, quotePracticePack, type PracticeCatalog, type PracticePack } from '../server/src/contracts/practicePacks';
import './credit-calculator.css';

export function PracticeCalculator({catalog,onCheckout,busy=false,checkoutLabel='Checkout'}:{catalog:PracticeCatalog;onCheckout:(pack:PracticePack)=>void;busy?:boolean;checkoutLabel?:string}) {
  const [pack,setPack]=useState<PracticePack>(()=>{
    const fallback:PracticePack={calls:5,recordings:0,retention:false,minutes:15};
    if(typeof window==='undefined')return fallback;
    const q=new URLSearchParams(window.location.search);
    if(!q.has('creditCalls'))return fallback;
    const initial={calls:Number(q.get('creditCalls')),recordings:Number(q.get('creditRecordings')),retention:q.get('creditStorage')==='1',minutes:Number(q.get('practiceMinutes')||15)};
    try{return quotePracticePack(initial,catalog.prices).pack;}catch{return fallback;}
  });
  let total:ReturnType<typeof quotePracticePack>|null=null,issue='';
  try{total=quotePracticePack(pack,catalog.prices);}catch(error){issue=error instanceof Error?error.message:'Check your selection.';}
  const available=Math.max(0,Math.floor(catalog.recordingMinutesAvailable/(16*pack.minutes/15)));
  const capacityExceeded=pack.recordings>available;
  const format=(value:number)=>value.toLocaleString('en-US');
  const factor=pack.minutes/15;
  return <div className="credit-shop">
    <div className="credit-shop__intro"><h2>Choose your practice</h2><p>Choose a duration, then add the calls and recordings you need. Your purchases do not expire.</p></div>
    <form onSubmit={event=>{event.preventDefault();if(total&&!busy&&catalog.salesEnabled&&!capacityExceeded)onCheckout(total.pack);}}>
      <label className="practice-duration">Choose duration<select value={pack.minutes} disabled={busy} onChange={event=>setPack(previous=>({...previous,minutes:Number(event.target.value) as 15|30}))}><option value="15">15 minutes</option><option value="30">30 minutes · 2× the 15-minute price</option></select></label>
      <div className="credit-shop__rates">
        <article><h3>Calls</h3><strong>{format(catalog.prices.callUzs*factor)} <small>UZS/call</small></strong><p>{format(baseServiceStars(catalog.prices.callUzs,catalog.prices)*factor)} Stars/call</p><p>One participant, up to {pack.minutes} minutes. Matching and IELTS prompts included.</p></article>
        <article><h3>Recordings</h3><strong>{format(catalog.prices.recordingUzs*factor)} <small>UZS/recording</small></strong><p>{format(baseServiceStars(catalog.prices.recordingUzs,catalog.prices)*factor)} Stars/recording</p><p>Both voices from one {pack.minutes}-minute call, with both partners’ consent.</p></article>
      </div>
      <div className="credit-shop__quantities">{(['calls','recordings'] as const).map(kind=><label key={kind}>{kind==='calls'?'Calls':'Recordings'}<input type="number" min={kind==='calls'?1:0} step="1" required value={Number.isNaN(pack[kind])?'':pack[kind]} disabled={busy} onChange={event=>{const n=event.target.value===''?NaN:Number(event.target.value);setPack(previous=>({...previous,[kind]:n,retention:kind==='recordings'&&n===0?false:previous.retention}));}}/></label>)}</div>
      <p className="credit-shop__note" role="status">{available?`${format(available)} ${pack.minutes}-minute recordings available. Capacity is checked again at checkout.`:'Recording purchases are temporarily sold out. You can still buy calls.'}{capacityExceeded&&' Reduce recordings to continue.'}</p>
      <label className="credit-shop__storage"><input type="checkbox" checked={pack.retention} disabled={!pack.recordings||busy} onChange={event=>setPack(previous=>({...previous,retention:event.target.checked}))}/><span><b>Add 30-day retention</b><br/>{format(catalog.prices.retentionUzs*factor)} UZS per {pack.minutes}-minute recording. Applies to all {Number.isSafeInteger(pack.recordings)?format(pack.recordings):'selected'} recordings.</span></label>
      <p className="credit-shop__note">Without retention, audio is delivered to Telegram and kept for delivery recovery for up to 24 hours. With retention, 30 days starts when the recording is created. Download your own copy.</p>
      <div className="credit-shop__total" aria-live="polite">{total?<><dl className="practice-lines"><div><dt>{format(pack.calls)} calls × {format(catalog.prices.callUzs*factor)} UZS</dt><dd>{format(total.lines.callUzs)} UZS</dd></div><div><dt>{format(pack.recordings)} recordings × {format(catalog.prices.recordingUzs*factor)} UZS</dt><dd>{format(total.lines.recordingUzs)} UZS</dd></div>{pack.retention&&<div><dt>Retention for {format(total.retentionCount)} recordings</dt><dd>{format(total.lines.retentionUzs)} UZS</dd></div>}</dl><span>Total</span><strong>{format(total.uzs)} UZS</strong><span>or {format(total.stars)} Telegram Stars</span></>:<p role="status">{issue}</p>}</div>
      <p className="credit-shop__note">Recordings cannot exceed calls. Retention quantity always matches recordings. There is no monthly subscription or fixed purchase quantity ceiling.</p>
      <button type="submit" className="credit-shop__buy" disabled={!total||capacityExceeded||busy||!catalog.salesEnabled}>{busy?'Preparing checkout…':catalog.salesEnabled?checkoutLabel:'Purchases paused'}</button>
      <details className="practice-price-explanation"><summary>How prices and Stars are calculated</summary><p>Each 15-minute service uses its UZS price ÷ {format(catalog.prices.starUzs)} UZS per Star, plus {catalog.prices.starMarkupPercent}% markup, rounded up to a whole Star. A 30-minute service costs exactly twice the rounded 15-minute rate. Optional retention is converted with the same reference, then the basket rounds up.</p><p>The reference is set by PairTalk’s admin. The initial 255 UZS reference comes from the owner’s 100 Stars = 25,500 UZS purchase price. Your local taxes, store and region can change what you pay to obtain Stars.</p><p>Your balance uses 15-minute units: one 30-minute call or recording uses two. Failed connections and calls under five seconds return the reserved call units. A recording is charged only when a usable audio file is ready. Reconnecting uses no additional units.</p></details>
    </form>
  </div>;
}
