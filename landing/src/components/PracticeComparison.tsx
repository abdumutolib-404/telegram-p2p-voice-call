import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { formatPlanPrice, planPeriod, recommendPlan, type PublicPricing } from "../../../server/src/contracts/pricing";
import { practiceUrl } from "./SiteLayout";

// Dated tutoring benchmark, not a live quote or a Stars exchange rate.
const tutorUsdPerHour = 17;
const usdToUzs = 11963.16;
const example = { calls: 10, minutes: 15, days: 30 };
const tutorHours = example.calls * example.minutes / 60;
const uzsEstimate = (usd: number) => `≈ ${(Math.round(usd * usdToUzs / 1000) * 1000).toLocaleString("en-US")} UZS`;

type ComparisonRow = { label: string; ours: ReactNode; other: ReactNode; cost?: boolean };

function Benefit({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <><strong className="practice-comparison__benefit">{title}</strong><span className="practice-comparison__note">{children}</span></>;
}
function Price({ children, note }: { children: ReactNode; note: ReactNode }) {
  return <><strong className="practice-comparison__price num">{children}</strong><span className="practice-comparison__note">{note}</span></>;
}
function ComparisonTable({ id, title, competitor, note, rows }: { id: string; title: string; competitor: string; note: string; rows: ComparisonRow[] }) {
  return <div className="practice-comparison__group">
    <h3 id={id}>{title}</h3>
    <p className="practice-comparison__scroll-hint" id={`${id}-scroll`}>Swipe to see the full comparison.</p>
    <div className="practice-comparison__scroll" role="region" aria-labelledby={id} aria-describedby={`${id}-scroll`} tabIndex={0}>
      <table className="practice-comparison">
        <caption className="sr-only">{title}</caption>
        <colgroup><col className="practice-comparison__label-column" /><col /><col /></colgroup>
        <thead><tr>
          <th scope="col">What matters</th>
          <th scope="col" className="practice-comparison__featured"><span className="practice-comparison__brand">PairTalk</span></th>
          <th scope="col">{competitor}<span className="practice-comparison__note">{note}</span></th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={row.label} className={row.cost ? "practice-comparison__budget" : undefined}>
          <th scope="row">{row.label}</th>
          <td className="practice-comparison__featured"><div className="practice-comparison__advantage"><Check className="i i--sm" aria-hidden="true" /><div>{row.ours}</div></div></td>
          <td>{row.other}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export function PracticeComparison({ pricing, loading }: { pricing: PublicPricing | null; loading: boolean }) {
  const free = pricing?.plans.find(plan => plan.id === "FREE" && plan.prices.UZS === 0 && plan.prices.XTR === 0);
  const plan = pricing ? recommendPlan(
    pricing.plans.filter(plan => plan.period === "calendar_month" || plan.validityDays >= example.days),
    { calls: example.calls, minutes: example.minutes, recordings: 0, retentionDays: 1 }, "UZS",
  ) : undefined;
  const unavailable = loading ? "Checking current prices…" : "Check current plans";
  const communityRows: ComparisonRow[] = [
    {
      label: "Finding someone online",
      ours: <Benefit title="Instant matchmaking">Tap to join the live queue. No posts, DMs or chasing replies.</Benefit>,
      other: <Benefit title="Post and wait">Ask who’s available, message people and hope someone replies.</Benefit>,
    },
    {
      label: "A partner at your level",
      ours: <Benefit title="Automatic level-based matching">Your self-assessed speaking level and skills guide the match.</Benefit>,
      other: <Benefit title="Find the right fit yourself">Ask about levels and try partners until someone fits.</Benefit>,
    },
    {
      label: "Ready when you are",
      ours: <Benefit title="Start a search on your schedule">Open Telegram and join the queue when you want to practise.</Benefit>,
      other: <Benefit title="Coordinate every conversation">Work through replies, time zones and schedules before you can talk.</Benefit>,
    },
    {
      label: "What to talk about",
      ours: <Benefit title="IELTS prompts built into the call">Parts 1, 2 and 3 are ready when your conversation starts.</Benefit>,
      other: <Benefit title="Bring your own structure">Find prompts, agree a format and set up the call yourself.</Benefit>,
    },
  ];
  const tutorRows: ComparisonRow[] = [
    {
      label: "Try before paying",
      ours: pricing?.credits ? <Benefit title="Start with free practice calls">Three one-time starter calls, up to 15 minutes each. No card needed.</Benefit> : free
        ? <Benefit title="Start with free practice calls">{free.unlimitedCalls ? "Unlimited" : free.calls} free calls per {planPeriod(free)}, up to {free.maxCallMinutes} minutes each. No card needed.</Benefit>
        : <a href="/pricing">{unavailable}</a>,
      other: <Benefit title="The first trial is paid">Preply charges for the initial trial lesson before a subscription.</Benefit>,
    },
    {
      label: "10 sessions × 15 min",
      cost: true,
      ours: pricing?.credits ? <Price note="10 independent call credits · no subscription · recordings optional">{Math.ceil(pricing.credits.rates.CALL.uzs*10).toLocaleString('en-US')} UZS</Price> : plan
        ? <Price note={`${plan.name} · full ${planPeriod(plan)} price · ${plan.unlimitedCalls ? "unlimited" : plan.calls} included calls`}>
            {formatPlanPrice(plan, "UZS")}<span className="practice-comparison__alternate">or {formatPlanPrice(plan, "XTR")}</span>
          </Price>
        : <a href="/pricing">{loading ? unavailable : "See plans for this routine"}</a>,
      other: <Price note={`$${tutorUsdPerHour * tutorHours} for ${tutorHours} hours at Preply’s $${tutorUsdPerHour}/hour published average · estimate`}>{uzsEstimate(tutorUsdPerHour * tutorHours)}</Price>,
    },
    {
      label: "Fitting practice into your day",
      ours: <Benefit title="No lesson booking needed">Join matchmaking when you have time to speak.</Benefit>,
      other: <Benefit title="Book around the tutor’s availability">Choose an open lesson slot and fit practice around it.</Benefit>,
    },
  ];

  return <section className="band section" id="compare" aria-labelledby="comparison-title">
    <div className="wrap">
      <div className="section-head practice-comparison__intro">
        <h2 id="comparison-title">Less waiting. More speaking.</h2>
        <p>Skip the group-chat search and the cost of booking a tutor for every conversation. PairTalk matches you by level, with free calls to get started.</p>
      </div>
      <ComparisonTable id="compare-communities" title="Skip the group-chat search." competitor="Practice communities" note="Self-organised group chats" rows={communityRows} />
      <p className="practice-comparison__availability">Matchmaking starts immediately; connection time depends on compatible learners being online.</p>
      <ComparisonTable id="compare-tutors" title="Keep your practice affordable." competitor="Private tutoring" note="Preply price and trial benchmark" rows={tutorRows} />
      <div className="practice-comparison__footer">
        <div>
          <p>The cost example covers {example.calls} sessions of {example.minutes} minutes within {example.days} days. PairTalk prices update from our current plans; Stars and UZS are separate payment options.</p>
          <details className="practice-comparison__sources"><summary>Prices, sources and assumptions</summary>
            <p>Tutor benchmark: <a href="https://preply.com/en/online/tutors-ielts">Preply’s published IELTS tutor average</a> of $17/hour, checked 15 October 2026. UZS estimates use the <a href="https://cbu.uz/en/arkhiv-kursov-valyut/">Central Bank of Uzbekistan</a> rate of 11,963.16 UZS per USD on that date, rounded to the nearest 1,000 UZS. Five hours × $17 = $85. These are teaching-time estimates, not checkout quotes; individual rates, lesson lengths and billing vary.</p>
            <p><a href="https://help.preply.com/en/articles/4179487-how-to-book-a-trial-lesson">Preply’s initial trial lessons are paid</a>; its replacement-trial policy and other tutors’ offers may differ. The PairTalk example uses the full price of the lowest-priced current UZS plan covering 10 calls of at least 30 minutes in a 30-day period, including any unused allowance. PairTalk provides peer practice; tutoring includes professional teaching.</p>
            <a href="/pricing">See all current PairTalk prices and allowances</a>
          </details>
        </div>
        <a className="btn btn--primary" href={practiceUrl}>Try PairTalk free</a>
      </div>
    </div>
  </section>;
}
