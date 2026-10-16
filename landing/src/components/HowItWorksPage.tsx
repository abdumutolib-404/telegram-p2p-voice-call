import { BookOpen, Clock, Mic, Send, Star, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { pages } from "../content";
import { practiceUrl } from "./SiteLayout";
import { SectionFaq } from '../../../platform/SectionFaq';
import { practiceQuestions } from '../../../platform/practiceQuestions';

function StepVisual({step}: {step: number}) {
  if(step===0) return <><p className="small muted">Example speaking scores</p><dl className="kv">{[["Fluency","7.0"],["Lexical","6.5"],["Grammar","7.0"],["Pronunciation","6.5"]].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl></>;
  if(step===1) return <><div className="rings"><div className="rings__orbit"/><div className="avatar"><BookOpen size={24}/></div></div><p className="accent small">Searching for a match</p></>;
  if(step===2) return <div className="pair"><div className="pair__who"><div className="avatar">Y</div><span>You</span></div><div className="wave is-idle" aria-hidden="true">{Array.from({length:20},(_,i)=><i key={i}/>)}</div><div className="pair__who"><div className="avatar avatar--other">P</div><span>Partner</span></div></div>;
  return <><p className="small muted">Example post-call rating</p><div className="example-stars" role="img" aria-label="4 out of 5 stars">{Array.from({length:5},(_,i)=><Star key={i} size={24} fill={i<4?"currentColor":"none"} aria-hidden="true" />)}</div></>;
}
const requirements: {icon: LucideIcon; title: string; text: string}[] = [
  {icon:Send,title:"Telegram",text:"PairTalk opens inside Telegram as a Mini App, on phone or desktop."},
  {icon:Mic,title:"A microphone",text:"Allow microphone access when asked. Headphones help avoid echo."},
  {icon:Clock,title:"A quiet space",text:"Pick a place where you can speak freely, and keep personal details private."},
];
export function HowItWorksPage() {
  const sections=pages["/how-it-works"].sections;
  const steps=[{title:"Open PairTalk and set your level",sections:sections.slice(0,2)},...sections.slice(2).map(section=>({title:section.title,sections:[section]}))];
  return <>
    <div className="wrap page-head"><nav className="breadcrumb" aria-label="Breadcrumb"><a href="/">PairTalk</a><span aria-hidden="true">/</span><span aria-current="page">How it works</span></nav><h1>From opening Telegram to finishing a call.</h1><p>Four steps, no extra app, and no phone numbers shared with partners.</p></div>
    <div className="wrap"><ol className="longsteps">{steps.map((step,i)=><li className="longstep" key={step.title}><div><h2>{step.title}</h2>{step.sections.map(section=><div className="step-copy" id={section.id} key={section.id}>{section.body}</div>)}</div><div className="card step-example"><StepVisual step={i}/></div></li>)}</ol></div>
    <section className="band section"><div className="wrap"><div className="section-head"><h2>A 15-minute call, step by step.</h2><p>Suggested pacing for a practice session. This is peer practice, not an official mock test.</p></div><div className="timeline" role="list">{[["Connect and greet","About 1 min",1],["Part 1 · Everyday questions","About 4 min",4],["Part 2 · Your long turn","About 4 min, including 1 min to prepare",4],["Part 3 · Discussion","About 4 min",4],["Feedback swap","About 2 min",2]].map(([title,time,weight])=><div className="timeline__seg" role="listitem" key={title} style={{"--w":weight} as CSSProperties}><div className="timeline__bar" aria-hidden="true"/><strong>{title}</strong><span>{time}</span></div>)}</div></div></section>
    <section className="section"><div className="wrap"><div className="section-head"><h2>What you need.</h2><p>A few things make the call go better.</p></div><div className="cards-3">{requirements.map(({icon:Icon,title,text})=><div className="card" key={title}><div className="tile"><Icon size={28} aria-hidden="true"/></div><h3>{title}</h3><p>{text}</p></div>)}</div></div></section>
    <div className="wrap section"><SectionFaq title="Before you start" questions={practiceQuestions}/></div>
    <section className="band section"><div className="wrap cta-band"><h2>Try your first call free.</h2><a className="btn btn--primary btn--lg" href={practiceUrl}>Start speaking</a></div></section>
  </>;
}
