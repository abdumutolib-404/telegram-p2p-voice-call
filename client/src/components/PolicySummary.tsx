import { useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from './Brand';
import { publicSiteUrl } from '../services/dashboard';
import { SectionFaq, type SectionQuestion } from '../../../platform/SectionFaq';

export function PolicySummary({title,route,onBack,children,questions}:{title:string;route:string;onBack?:()=>void;children:ReactNode;questions:SectionQuestion[]}) {
  const back=useCallback(()=>{if(onBack)onBack();else if(window.history.length>1)window.history.back();else window.location.hash='';},[onBack]);
  useEffect(()=>{
    const button=window.Telegram?.WebApp?.BackButton;
    button?.show();button?.onClick(back);
    return()=>{button?.offClick(back);button?.hide();};
  },[back]);
  return <main className="policy-screen"><div className="policy-summary">
    <header className="policy-header"><Brand/><button type="button" className="secondary-button" onClick={back}><ArrowLeft size={16} aria-hidden="true"/>Back</button><div className="policy-heading"><span className="eyebrow">PairTalk speaking practice</span><h1>{title}</h1></div></header>
    <p>A quick guide to the policies effective 16 October 2026. Read the complete version before agreeing in the bot.</p>
    {children}
    <SectionFaq title="Common questions" questions={questions}/>
    <nav className="legal" aria-label="Full policy documents"><a href={new URL(route,publicSiteUrl).toString()} target="_blank" rel="noreferrer">Read the complete policy</a><a href={new URL('terms',publicSiteUrl).toString()} target="_blank" rel="noreferrer">Terms of use</a><a href={new URL('policies/pairtalk-policies-2026-10-16.pdf',publicSiteUrl).toString()} target="_blank" rel="noreferrer">All policies as PDF</a></nav>
    <p>For account, payment or privacy questions, use /paysupport in the bot or contact <a href="https://t.me/PairTalkSupport" target="_blank" rel="noreferrer">@PairTalkSupport</a>.</p>
  </div></main>;
}
