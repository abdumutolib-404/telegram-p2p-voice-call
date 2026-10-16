import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { PublicPricing } from "../../../server/src/contracts/pricing";
import { practiceUrl } from "./SiteLayout";

// Dated teaching-time estimate, not a live checkout quote or Stars exchange rate.
const tutorUsdPerHour = 17;
const usdToUzs = 11963.16; // CBU reference, 15 October 2026.
const calls = 10;
const minutes = 15;
const tutorHours = calls * minutes / 60;
const tutoringEstimate = Math.round(tutorUsdPerHour * tutorHours * usdToUzs / 1000) * 1000;
type Row = { label: string; ours: ReactNode; communities: ReactNode; tutors: ReactNode; cost?: boolean };

function Detail({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return <><strong className="practice-comparison__benefit">{title}</strong>{children && <span className="practice-comparison__note">{children}</span>}</>;
}

export function PracticeComparison({ pricing, loading }: { pricing: PublicPricing | null; loading: boolean }) {
  const current = pricing?.credits;
  const rows: Row[] = [
    {
      label: "Find a partner",
      ours: <Detail title="Instant matchmaking">Join the live queue in one tap.</Detail>,
      communities: <Detail title="Post, message, wait">Find someone online and arrange a call yourself.</Detail>,
      tutors: <Detail title="Find and book a tutor">Choose a teacher and an available lesson slot.</Detail>,
    },
    {
      label: "Match your level",
      ours: <Detail title="Level-based matching">Your self-assessed speaking skills guide the match.</Detail>,
      communities: <Detail title="Trial and error">Ask about levels and work out who fits.</Detail>,
      tutors: <Detail title="Choose a teacher">Check their experience, specialism and teaching style.</Detail>,
    },
    {
      label: "Fit practice into your day",
      ours: <Detail title="Start when you have time">No lesson booking needed.</Detail>,
      communities: <Detail title="Coordinate every time">Work through messages, schedules and time zones.</Detail>,
      tutors: <Detail title="Work around lesson slots">Book ahead and follow the tutor’s schedule.</Detail>,
    },
    {
      label: "Know what to discuss",
      ours: <Detail title="IELTS prompts in the call">Parts 1, 2 and 3, ready to practise.</Detail>,
      communities: <Detail title="Bring your own structure">Find prompts and agree how to practise.</Detail>,
      tutors: <Detail title="Teacher-led lessons">Guidance and feedback depend on the tutor and lesson.</Detail>,
    },
    {
      label: "Try it first",
      ours: current ? <Detail title={`${current.starterCalls} free starter calls`}>Up to 15 minutes each. No card needed.</Detail> : <a href="/pricing">{loading ? "Checking starter calls…" : "See starter practice"}</a>,
      communities: <Detail title="Organise your own trial">You still need to find an available partner.</Detail>,
      tutors: <Detail title="Paid trial on Preply">Trial and refund policies vary by provider.</Detail>,
    },
    {
      label: "10 × 15-minute sessions",
      cost: true,
      ours: current ? <Detail title={<span className="practice-comparison__price num">{(current.rates.CALL.uzs * calls).toLocaleString("en-US")} UZS</span>}>Buy exactly ten calls. Recordings are optional.</Detail> : <a href="/pricing">{loading ? "Checking prices…" : "See call prices"}</a>,
      communities: <Detail title="Your time goes into organising">Group rules, partner availability and any fees vary.</Detail>,
      tutors: <Detail title={<span className="practice-comparison__price num">≈ {tutoringEstimate.toLocaleString("en-US")} UZS</span>}>2.5 hours at Preply’s published $17/hour average. Estimate.</Detail>,
    },
  ];
  return <section className="band section" id="compare" aria-labelledby="comparison-title">
    <div className="wrap">
      <div className="section-head practice-comparison__intro">
        <h2 id="comparison-title">More speaking. Less organising.</h2>
        <p>A partner at your level, prompts in the call, and practice that fits your day.</p>
      </div>
      <p className="practice-comparison__scroll-hint" id="comparison-scroll">Swipe across to compare all three options.</p>
      <div className="practice-comparison__scroll" role="region" aria-labelledby="comparison-title" aria-describedby="comparison-scroll" tabIndex={0}>
        <table className="practice-comparison practice-comparison--unified">
          <caption className="sr-only">PairTalk compared with practice communities and private tutoring</caption>
          <colgroup><col className="practice-comparison__label-column" /><col /><col /><col /></colgroup>
          <thead><tr>
            <th scope="col">Your practice</th>
            <th scope="col" className="practice-comparison__featured"><span className="practice-comparison__brand">PairTalk</span><span className="practice-comparison__note">Speaking partners, on demand</span></th>
            <th scope="col">Communities<span className="practice-comparison__note">Self-organised group chats</span></th>
            <th scope="col">Tutors<span className="practice-comparison__note">Professional teaching</span></th>
          </tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} className={row.cost ? "practice-comparison__budget" : undefined}>
            <th scope="row">{row.label}</th>
            <td className="practice-comparison__featured"><div className="practice-comparison__advantage"><Check className="i i--sm" aria-hidden="true" /><div>{row.ours}</div></div></td>
            <td>{row.communities}</td><td>{row.tutors}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="practice-comparison__footer">
        <div>
          <p>Matchmaking starts immediately; connection time depends on compatible learners being online. PairTalk offers peer practice. Tutoring includes professional teaching.</p>
          <details className="practice-comparison__sources"><summary>About the price comparison</summary>
            <p>The example is ten 15-minute calls: {tutorHours} hours of speaking time. PairTalk uses the current published call price, excluding optional recordings and retention.</p>
            <p><a href="https://preply.com/en/online/tutors-ielts">Preply publishes an average IELTS tutor rate of $17/hour</a>, checked 16 October 2026. {tutorHours} × $17 = $42.50. The UZS estimate uses the <a href="https://cbu.uz/en/arkhiv-kursov-valyut/">CBU reference of 11,963.16 UZS/USD on 15 October 2026</a>, rounded to the nearest 1,000 UZS. This is a prorated teaching-time comparison, not a lesson checkout quote; actual rates and lesson lengths vary.</p>
            <p><a href="https://help.preply.com/en/articles/4179487-how-to-book-a-trial-lesson">Preply’s initial trial lessons are paid</a>. Other tutors may offer different trials. Community groups have different rules and are not a managed matchmaking service.</p>
          </details>
        </div>
        <a className="btn btn--primary" href={practiceUrl}>Try PairTalk free</a>
      </div>
    </div>
  </section>;
}
