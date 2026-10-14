import { useEffect, useRef, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import { DashboardError, dashboardRequest } from '../services/dashboard';
import '../styles/discounts.css';

interface Offer { id:string;planName:string;validityDays:number;percent:number;originalStars:number;originalUzs:number;starsPrice:number;uzsPrice:number;expiresAt:string }
function remaining(milliseconds:number){
  const seconds=Math.max(0,Math.ceil(milliseconds/1000)),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
  return `${days?`${days}d `:''}${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
}
export function DiscountOffers({initData,onAccessLost}:{initData:string;onAccessLost:()=>void}){
  const [offers,setOffers]=useState<Offer[]>([]),[now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
  const lost=useRef(onAccessLost);lost.current=onAccessLost;
  useEffect(()=>{
    const controller=new AbortController();let inFlight=false;
    const load=async()=>{
      if(inFlight||controller.signal.aborted||document.visibilityState==='hidden')return;
      inFlight=true;
      try{
        const data=await dashboardRequest<{offers:Offer[];serverNow:string}>(initData,'/discount-offers',{signal:controller.signal});
        const serverTime=Date.parse(data.serverNow);
        if(!Array.isArray(data.offers)||!Number.isFinite(serverTime))throw new Error('Offers are temporarily unavailable.');
        if(!controller.signal.aborted){setOffers(data.offers);setOffset(serverTime-Date.now());setNow(Date.now());setError('');}
      }catch(e){if(!controller.signal.aborted){if(e instanceof DashboardError&&e.status===403)lost.current();else setError('Offers are temporarily unavailable.');}}
      finally{inFlight=false;}
    };
    void load();const poll=window.setInterval(()=>void load(),30000);
    const focus=()=>void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{controller.abort();window.clearInterval(poll);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[initData,refresh]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const active=offers.filter(offer=>Date.parse(offer.expiresAt)>now+offset);
  const bot=(import.meta.env.VITE_BOT_USERNAME||'PairTalkBot').replace(/^@/,'');
  if(!active.length&&!error)return null;
  return <section className="discount-offers" aria-label="Your exclusive offers">
    {error&&<p className="discount-offer-error" role="status">{error} <button type="button" className="text-button" onClick={()=>setRefresh(value=>value+1)}>Check offers again</button></p>}
    {active.map(offer=><article className="discount-offer" key={offer.id}>
      <div className="discount-offer-heading"><Sparkles size={18} aria-hidden="true"/><h2>Exclusive {offer.percent}% offer for {offer.planName}</h2></div>
      <p className="discount-offer-prices"><span><s>{offer.originalStars} Stars</s> <strong>{offer.starsPrice} Stars</strong></span><span><s>{offer.originalUzs.toLocaleString()} UZS</s> <strong>{offer.uzsPrice.toLocaleString()} UZS</strong></span></p>
      <div className="discount-offer-footer"><p><Clock size={15} aria-hidden="true"/>Ends in <span role="timer" aria-live="off">{remaining(Date.parse(offer.expiresAt)-now-offset)}</span></p><a className="secondary-button" href={`https://t.me/${bot}?start=discount_${encodeURIComponent(offer.id)}`} onClick={event=>{if(Date.now()+offset>=Date.parse(offer.expiresAt)){event.preventDefault();setNow(Date.now());}}}>Claim Offer</a></div>
      <p className="discount-offer-note">Plan validity: {offer.validityDays} {offer.validityDays===1?'day':'days'}.<br/>Personal offer · claim once before it expires.</p>
    </article>)}
  </section>;
}
