import { useState, type CSSProperties } from "react";
import { Check, ShieldCheck, LockKeyhole } from "lucide-react";
import { practiceUrl } from "./SiteLayout";
import { StatsSummary } from "./StatsPage";
import { usePublicStats } from "../lib/publicStats";
import { faqs } from "../content";
import { usePricing } from "../../../platform/usePricing";
import { planPeriod, type PublicPricing } from "../../../server/src/contracts/pricing";
import { PracticeComparison } from "./PracticeComparison";
const prompts = [
  ["Everyday conversation","What do you enjoy about the place where you live?","Answer directly, then add a reason or a small example."],
  ["Your long turn","Describe a skill you would like to learn.","What is it? Why does it interest you? How would you start learning it?"],
  ["A deeper discussion","How has the way people learn new skills changed?","Compare past and present, and give your own view with a reason."],
];
function PracticeBoard() {
  const [part,setPart]=useState(1);
  return <div className="card card--float prompt-card" role="group" aria-label="Example practice prompts"><div className="seg seg--full" role="group" aria-label="IELTS Speaking part">{prompts.map((_,i)=><button key={i} type="button" aria-pressed={part===i} onClick={()=>setPart(i)}>Part {i+1}</button>)}</div><div className="stack" aria-live="polite"><p className="small accent prompt-kind">{prompts[part][0]}</p><p className="prompt-card__q">{prompts[part][1]}</p><p className="prompt-card__hint">{prompts[part][2]}</p></div></div>;
}
function FreeTicket({ data }: { data: PublicPricing | null }) {
  if(data?.credits)return <div className="ticket"><div className="ticket__price"><strong>3 free calls</strong><span className="muted">one starter gift · no card needed</span></div><ul className="checks"><li><Check className="i"/>Up to 15 minutes per call</li><li><Check className="i"/>Level-based matching and IELTS prompts</li><li><Check className="i"/>Buy calls and recordings separately</li><li><Check className="i"/>Purchased calls and recordings do not expire</li></ul></div>;
  const plan = data?.plans.find(plan=>plan.id==="FREE");
  return <div className="ticket"><div className="ticket__price"><strong>Free</strong><span className="muted">no card needed</span></div><ul className="checks">{plan?<><li><Check className="i" />{plan.unlimitedCalls?"Unlimited calls":`${plan.calls} calls`} per {planPeriod(plan)}</li><li><Check className="i" />Up to {plan.maxCallMinutes} minutes per call</li></>:<li><Check className="i" />See current allowances on the plans page</li>}<li><Check className="i" />Partner matching and in-call prompts</li></ul><p className="small muted ticket-note">Allowances and prices are confirmed in Telegram before purchase.</p></div>;
}
export function LandingPage({ initialPricing = null }: { initialPricing?: PublicPricing | null }) {
  const {data:stats}=usePublicStats();
  const {data:pricing, loading:pricingLoading} = usePricing(import.meta.env.VITE_PUBLIC_PRICING_URL || "/api/public/plans", true, initialPricing);
  return <>

    <section className="hero" id="start">
      <div className="wrap hero__grid">
        <div>
          <h1>Practice IELTS Speaking with a real partner.</h1>
          <p className="hero__lead">Match with another learner at your level on Telegram, talk through exam-style prompts, and swap feedback. No extra app to install.</p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href={practiceUrl}>Find my speaking partner</a>
            <a className="link" href="#how-it-works">See how it works</a>
          </div>
          <p className="hero__note">
            <span><Check className="i i--sm" aria-hidden="true" />Free to get started</span>
            <span><Check className="i i--sm" aria-hidden="true" />Practice under an alias</span>
          </p>
        </div>

        <div className="card card--float call-card" aria-label="Example of a practice call">
          <div className="call-card__top">
            <span className="chip chip--ok chip--dot">Part 2 · Cue card</span>
            <div className="call-card__timer">
              <span className="timer num">02:05</span>
              <span className="small muted">12:55 left</span>
            </div>
          </div>
          <div className="pair">
            <div className="pair__who"><div className="avatar">Y</div><span>You</span></div>
            <div className="wave hero-wave" >{Array.from({length:26},(_,i)=><i key={i} style={{"--h":20+((i*37)%65),"--d":i*35} as CSSProperties} />)}</div>
            <div className="pair__who"><div className="avatar avatar--other">R</div><span>Partner</span></div>
          </div>
          <div className="call-card__prompt">
            <h3>Describe a skill you would like to learn.</h3>
            <p className="muted">What is it? Why does it interest you? How would you start learning it?</p>
          </div>
          <div className="call-card__foot"><span>Take notes, then speak for up to two minutes.</span><span>Example interface</span></div>
        </div>
      </div>
    </section>

    <section className="band section proof-section" aria-label="Community numbers"><div className="wrap"><div className="proof"><StatsSummary fallbackFeatures /><a className="link" href="/stats">See how we count</a></div><p className="proof__note">{stats ? `Snapshot: ${stats.updatedAt.slice(0,16).replace('T',' ')} UTC. Figures describe practice activity.` : 'Community figures appear when verified data is available.'}</p></div></section>
    <section className="section" id="how-it-works">
      <div className="wrap">
        <div className="section-head">
          <h2>A practice partner, without the group-chat search.</h2>
          <p>You bring the willingness to try. We make finding a conversation simpler.</p>
        </div>
        <ol className="steps">
          <li className="step">
            <span className="step__num" aria-hidden="true"></span>
            <div className="step__visual" aria-hidden="true"><div className="slider-demo"><span style={{"--v": "68%"} as CSSProperties}></span><span style={{"--v": "42%"} as CSSProperties}></span><span style={{"--v": "80%"} as CSSProperties}></span></div></div>
            <h3>Set your level and focus</h3>
            <p>Enter your self-assessed speaking scores and the skills you want to work on. Matching considers your level and complementary strengths.</p>
          </li>
          <li className="step">
            <span className="step__num" aria-hidden="true"></span>
            <div className="step__visual" aria-hidden="true"><div className="pair" style={{"width": "100%"} as CSSProperties}><div className="avatar avatar--sm">A</div><div className="wave is-idle"  style={{"height": "32px"} as CSSProperties}>{Array.from({length:26},(_,i)=><i key={i} style={{"--h":20+((i*37)%65),"--d":i*35} as CSSProperties} />)}</div><div className="avatar avatar--sm avatar--other">B</div></div></div>
            <h3>Get matched with a partner</h3>
            <p>Join the queue and connect with another available learner. No public phone numbers and no endless “anyone online?” messages.</p>
          </li>
          <li className="step">
            <span className="step__num" aria-hidden="true"></span>
            <div className="step__visual" aria-hidden="true"><div className="bubbles"><span className="bubble">Hello.</span><span className="bubble bubble--other">Let’s talk.</span></div></div>
            <h3>Speak, listen, swap roles</h3>
            <p>Use speaking prompts, take turns as examiner and candidate, and give thoughtful feedback. Build a routine that makes speaking feel familiar.</p>
          </li>
        </ol>
      </div>
    </section>

    <section className="band section" id="guide"><div className="wrap split"><PracticeBoard /><div className="stack-lg"><h2>Less “what do we talk about?” More talking.</h2><p className="body-l muted measure">Practice familiar topics, take a longer turn, or explore a deeper question together.</p><ul className="checks"><li><Check className="i" />Practice IELTS Speaking Parts 1, 2 and 3</li><li><Check className="i" />Work on fluency, vocabulary, grammar and pronunciation</li><li><Check className="i" />Take turns speaking and giving feedback</li></ul><a className="btn btn--secondary" href="/ielts-speaking">Read the speaking guide</a></div></div></section>
    <section className="section" id="safety">
      <div className="wrap split">
        <div className="stack-lg">
          <h2>Practice with an alias, not a public profile.</h2>
          <p className="body-l muted measure">Your partner sees your PairTalk alias, not your Telegram contact details. Leave a call whenever you need to, and report inappropriate behavior afterwards.</p>
          <p className="muted measure">Choose what you share. Agree with your partner before recording, and keep personal information private.</p>
          <a className="btn btn--secondary" href="/safety">How we keep practice safe</a>
        </div>
        <div className="stack">
          <div className="card alias-card">
            <div className="avatar">R</div>
            <div style={{"flex": "1"} as CSSProperties}><p className="small muted">Example PairTalk alias</p><p className="alias-card__name">P2P-XXXXX</p></div>
            <ShieldCheck className="i i--lg accent" aria-hidden="true" />
          </div>
          <ul className="checks" style={{"paddingInline": "var(--s-2)"} as CSSProperties}>
            <li><LockKeyhole className="i" aria-hidden="true" />Your Telegram contact details stay hidden</li>
            <li><Check className="i" aria-hidden="true" />You choose what you share</li>
            <li><Check className="i" aria-hidden="true" />Leave a call and report afterwards</li>
          </ul>
        </div>
      </div>
    </section>


    <PracticeComparison pricing={pricing} loading={pricingLoading} />

    <section className="band--accent section free" id="plans">
      <div className="wrap split">
        <div className="stack-lg">
          <h2>Your first calls are free.</h2>
          <p className="body-l muted measure">Start with three free practice calls. Add call or recordings when you need them, with no monthly subscription.</p>
          <div className="row"><a className="btn btn--primary btn--lg" href={practiceUrl}>Start with a free call</a><a className="link" href="/pricing">See prices</a></div>
        </div>
        <FreeTicket data={pricing} /></div></section>

    <section className="section" id="faq"><div className="wrap faq-grid"><div className="stack"><h2>Before you say hello.</h2><a className="link" href="/faq">All questions and answers</a></div><div>{faqs.slice(0,6).map(faq=><details className="acc" name="home-faq" key={faq.q}><summary>{faq.q}</summary><div className="acc__body">{faq.a}</div></details>)}</div></div></section><section className="band section" style={{"paddingBlock": "56px"} as CSSProperties}>
      <div className="wrap cta-band">
        <h2 style={{"maxWidth": "18ch"} as CSSProperties}>Ready to speak?</h2>
        <a className="btn btn--primary btn--lg" href={practiceUrl}>Start speaking</a>
      </div>
    </section>

</>;
}
