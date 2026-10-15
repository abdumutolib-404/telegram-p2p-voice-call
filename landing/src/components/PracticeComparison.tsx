import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { formatPlanPrice, planPeriod, recommendPlan, type PublicPricing } from "../../../server/src/contracts/pricing";
import { practiceUrl } from "./SiteLayout";

// Dated external benchmark, not a live tutor quote or a Stars exchange rate.
const tutorUsdPerHour = 17;
const usdToUzs = 11963.16;
const example = { calls: 10, minutes: 30, days: 30 };
const tutorHours = example.calls * example.minutes / 60;
const uzsEstimate = (usd: number) => `≈ ${(Math.round(usd * usdToUzs / 1000) * 1000).toLocaleString("en-US")} UZS`;

function Price({ children, note }: { children: ReactNode; note: ReactNode }) {
  return <><strong className="practice-comparison__price num">{children}</strong><span className="practice-comparison__note">{note}</span></>;
}

export function PracticeComparison({ pricing, loading }: { pricing: PublicPricing | null; loading: boolean }) {
  const free = pricing?.plans.find(plan => plan.id === "FREE" && plan.prices.UZS === 0 && plan.prices.XTR === 0);
  const plan = pricing ? recommendPlan(
    pricing.plans.filter(plan => plan.period === "calendar_month" || plan.validityDays >= example.days),
    { calls: example.calls, minutes: example.minutes, recordings: 0, retentionDays: 1 }, "UZS",
  ) : undefined;
  const unavailable = loading ? "Checking current prices…" : "Check current plans";
  const rows: { label: string; pairtalk: ReactNode; tutors: ReactNode; communities: ReactNode; cost?: boolean }[] = [
    {
      label: "Price to get started",
      pairtalk: free
        ? <Price note={`${free.unlimitedCalls ? "Unlimited" : free.calls} calls per ${planPeriod(free)} · up to ${free.maxCallMinutes} min each`}>0 UZS / 0 Stars</Price>
        : <a href="/pricing">{unavailable}</a>,
      tutors: <Price note={`$${tutorUsdPerHour}/hour · representative Preply average`}>{uzsEstimate(tutorUsdPerHour)} / hour</Price>,
      communities: <Price note="For free groups. You organise the practice.">0 UZS</Price>,
    },
    {
      label: "10 sessions × 30 min",
      cost: true,
      pairtalk: plan
        ? <Price note={`${plan.name} · full ${planPeriod(plan)} price · ${plan.unlimitedCalls ? "unlimited" : plan.calls} included calls`}>
            {formatPlanPrice(plan, "UZS")}<span className="practice-comparison__alternate">or {formatPlanPrice(plan, "XTR")}</span>
          </Price>
        : <a href="/pricing">{loading ? unavailable : "See plans for this routine"}</a>,
      tutors: <Price note={`$${tutorUsdPerHour * tutorHours} for ${tutorHours} teaching hours · estimate`}>{uzsEstimate(tutorUsdPerHour * tutorHours)}</Price>,
      communities: <Price note="No lesson fee; finding partners takes your own time.">0 UZS</Price>,
    },
    {
      label: "Finding a partner",
      pairtalk: "Automatic matching based on your self-assessed level and skills.",
      tutors: "Compare profiles and choose a tutor yourself.",
      communities: "Post in the group, message people and wait for replies.",
    },
    {
      label: "Starting a call",
      pairtalk: "Join the queue when you’re ready. No lesson booking needed.",
      tutors: "Book an available lesson slot around the tutor’s schedule.",
      communities: "Agree a time and calling tool with each partner.",
    },
    {
      label: "IELTS prompts",
      pairtalk: "Parts 1, 2 and 3 built into your call. Less time preparing topics.",
      tutors: "Lesson materials and format depend on the tutor.",
      communities: "Find your own prompts or rely on resources shared in the group.",
    },
    {
      label: "Contact privacy",
      pairtalk: "Speak under an alias. Your Telegram contact details stay hidden.",
      tutors: "Usually requires an account or sharing details to arrange lessons.",
      communities: "Your profile visibility depends on the group and your privacy settings.",
    },
    {
      label: "Record and review",
      pairtalk: "Built-in recording and Telegram delivery, within your plan’s allowance.",
      tutors: "Recording availability depends on the tutor and platform.",
      communities: "You may need a separate recording tool and storage.",
    },
    {
      label: "Feedback",
      pairtalk: "Swap practical feedback with a fellow learner after speaking.",
      tutors: "Expert corrections and individual guidance: the reason to pay for a tutor.",
      communities: "Informal peer advice; structured feedback is not guaranteed.",
    },
  ];

  return (
    <section className="band section" id="compare" aria-labelledby="comparison-title">
      <div className="wrap">
        <div className="section-head practice-comparison__intro">
          <h2 id="comparison-title">More speaking. Less searching.</h2>
          <p>Automatic matching, IELTS prompts and affordable calls, all inside Telegram. See what you save in money and effort.</p>
        </div>
        <p className="practice-comparison__scenario">The example budget covers {example.calls} sessions of {example.minutes} minutes within {example.days} days: {tutorHours} hours of conversation.</p>
        <p className="practice-comparison__scroll-hint" id="comparison-scroll-hint">Swipe the table to compare all three options.</p>
        <div className="practice-comparison__scroll" role="region" aria-label="Compare PairTalk, private tutors and free communities" aria-describedby="comparison-scroll-hint" tabIndex={0}>
          <table className="practice-comparison">
            <caption className="sr-only">PairTalk advantages, prices and estimated practice costs compared with private tutors and free practice communities</caption>
            <colgroup><col className="practice-comparison__label-column" /><col className="practice-comparison__featured-column" /><col /><col /></colgroup>
            <thead><tr>
              <th scope="col">What matters</th>
              <th scope="col" className="practice-comparison__featured"><span className="practice-comparison__brand">PairTalk</span><span className="practice-comparison__note">Built for regular practice</span></th>
              <th scope="col">Private tutors<span className="practice-comparison__note">Paid one-to-one lessons</span></th>
              <th scope="col">Free communities<span className="practice-comparison__note">Self-organised practice groups</span></th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.label} className={row.cost ? "practice-comparison__budget" : undefined}>
              <th scope="row">{row.label}</th>
              <td className="practice-comparison__featured">{typeof row.pairtalk === "string" ? <div className="practice-comparison__advantage"><Check className="i i--sm" aria-hidden="true" /><span>{row.pairtalk}</span></div> : row.pairtalk}</td>
              <td>{row.tutors}</td>
              <td>{row.communities}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="practice-comparison__footer">
          <div>
            <p>PairTalk prices come from our current plans. Stars and UZS are separate payment options. Tutor costs are estimates; free communities have no lesson fee.</p>
            <details className="practice-comparison__sources"><summary>Prices, sources and assumptions</summary>
              <p>Tutor benchmark: <a href="https://preply.com/en/online/tutors-ielts">Preply’s published IELTS tutor average</a> of $17/hour, checked 15 October 2026. UZS estimates use the <a href="https://cbu.uz/en/arkhiv-kursov-valyut/">Central Bank of Uzbekistan</a> rate of 11,963.16 UZS per USD on that date, rounded to the nearest 1,000 UZS. Five hours × $17 = $85. These are teaching-time estimates, not checkout quotes; individual rates, lesson lengths and billing vary.</p>
              <p>The PairTalk example shows the full price of the lowest-priced current UZS plan covering 10 calls of at least 30 minutes in a 30-day period, including any unused allowance. Free-community figures refer to groups with no membership or lesson fee. Tutor lessons include expert guidance; peer conversations do not. Matching depends on available learners. Recording requires both partners’ agreement.</p>
              <a href="/pricing">See all current PairTalk prices and allowances</a>
            </details>
          </div>
          <a className="btn btn--primary" href={practiceUrl}>Try PairTalk free</a>
        </div>
      </div>
    </section>
  );
}
