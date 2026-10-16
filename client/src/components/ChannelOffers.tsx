import { useEffect, useState } from 'react';
import { channelOfferStartId, dashboardRequest } from '../services/dashboard';
import { isChannelOffer, type ChannelOffer } from '../../../server/src/contracts/channelOffers';
import { SectionFaq } from '../../../platform/SectionFaq';
import { offerQuestions } from '../../../platform/practiceQuestions';

export function ChannelOffers({initData,revision,onSelect}:{initData:string;revision:number;onSelect:(offer:ChannelOffer,serverOffset:number)=>void}) {
  const [offers,setOffers]=useState<ChannelOffer[]>([]),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[notice,setNotice]=useState('');
  const [clock,setClock]=useState(Date.now()),[offset,setOffset]=useState(0);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(!initData)return;
    const controller=new AbortController();let timer:number|undefined;
    const load=async()=>{
      try{
        const id=channelOfferStartId();
        const result=await dashboardRequest<{offers:unknown[];serverNow:string}>(initData,'/pack-offers',{signal:controller.signal});
        if(!Array.isArray(result.offers)||!result.offers.every(isChannelOffer)||!Number.isFinite(Date.parse(result.serverNow)))throw new Error('Channel offers could not be checked.');
        let selected:ChannelOffer|undefined;
        if(id&&!result.offers.some(offer=>(offer as ChannelOffer).id===id)){
          try{const detail=await dashboardRequest<{offer:unknown}>(initData,`/pack-offers/${id}`,{signal:controller.signal});if(isChannelOffer(detail.offer))selected=detail.offer;}
          catch{if(!controller.signal.aborted)setNotice('The linked offer is no longer available. Other public offers appear below.');}
        }
        if(controller.signal.aborted)return;
        setOffers(result.offers as ChannelOffer[]);setOffset(Date.parse(result.serverNow)-Date.now());setError('');
        if(selected)setNotice(selected.claimStatus==='CLAIMED'?'You have already claimed this offer.':'The linked offer has ended or sold out.');
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Offers are unavailable.');}
      if(!controller.signal.aborted)timer=window.setTimeout(()=>void load(),5000);
    };
    void load();return()=>{controller.abort();clearTimeout(timer);};
  },[initData,revision,attempt]);
  const visible=offers.filter(offer=>offer.status==='ACTIVE'&&Date.parse(offer.expiresAt)>clock+offset&&offer.claimStatus!=='CLAIMED');
  if(!visible.length&&!error&&!notice)return null;
  return <section className="channel-offers" aria-label="Channel offers"><h2>Offers from @pairtalk</h2><p>Public packs, available once per person. No random selections or private offer messages.</p>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}<button type="button" className="secondary-button" onClick={()=>setAttempt(n=>n+1)}>Retry offers</button></p>}<div className="channel-offers__list">{visible.map(offer=>{
    const seconds=Math.max(0,Math.ceil((Date.parse(offer.expiresAt)-clock-offset)/1000));
    const held=offer.held>=offer.remaining;
    return <article key={offer.id}><h3>{offer.percent}% off your practice pack</h3><p>{offer.pack.calls} × {offer.pack.minutes}-minute calls · {offer.pack.recordings} recordings{offer.pack.retention?' · 30-day retention':''}</p><p><s>{offer.originalUzs.toLocaleString('en-US')} UZS</s> <strong>{offer.uzs.toLocaleString('en-US')} UZS</strong><br/><s>{offer.originalStars} Stars</s> <strong>{offer.stars} Stars</strong></p><p>{offer.remaining}/{offer.maximumClaims} left{offer.held?` · ${offer.held} temporarily reserved`:''}</p><p className="credit-shop__note">Ends in {Math.floor(seconds/3600)}h {Math.floor(seconds%3600/60)}m {seconds%60}s</p><button type="button" className="primary-button" disabled={held&&offer.claimStatus!=='HELD'} onClick={()=>onSelect(offer,offset)}>{held&&offer.claimStatus!=='HELD'?'Slots temporarily reserved':offer.claimStatus==='HELD'?'Resume offer checkout':'Review offer'}</button></article>;
  })}</div><SectionFaq title="About channel offers" questions={offerQuestions}/></section>;
}
