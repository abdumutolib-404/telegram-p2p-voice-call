import { ArrowUpRight, Check } from "lucide-react";
import { practiceUrl, supportUrl } from "./SiteLayout";
export function PricingPage() {
  const plans = [
    {
      name: "Free",
      title: "Find your rhythm.",
      description: "Try the experience before choosing a paid plan.",
      features: [
        "Partner matching",
        "Speaking prompts",
        "A limited practice allowance",
      ],
    },
    {
      name: "Plus",
      title: "Keep the conversation going.",
      description: "For learners making peer practice a regular habit.",
      features: [
        "More calls than Free",
        "Longer session allowance",
        "Expanded recording allowance",
      ],
    },
    {
      name: "Pro",
      title: "Build your speaking routine.",
      description: "For more frequent, extended practice sessions.",
      features: [
        "More calls than Plus",
        "Longer session allowance",
        "Longer recording retention",
      ],
    },
    {
      name: "Boss",
      title: "Make space for deep practice.",
      description: "The largest standard practice allowance.",
      features: [
        "Most standard-plan calls",
        "Longest standard sessions",
        "Longest recording retention",
      ],
    },
  ];
  return (
    <>
      <section className="container page-intro">
        <a className="breadcrumb" href="/">
          PairTalk /
        </a>
        <p className="eyebrow">A ROUTINE THAT FITS YOU</p>
        <h1>
          Start free.
          <br />
          Make room for more.
        </h1>
        <p>
          Meet your first speaking partner on the free plan. Paid plans offer
          more practice calls, longer sessions, and different recording
          allowances.
        </p>
      </section>
      <section className="container pricing-grid" aria-label="PairTalk plans">
        {plans.map((p) => (
          <article
            className={`pricing-card ${p.name === "Plus" ? "pricing-featured" : ""}`}
            key={p.name}
          >
            <p className="eyebrow">{p.name}</p>
            <h2>{p.title}</h2>
            <p>{p.description}</p>
            <div className="plan-cost">
              {p.name === "Free" ? "Free" : "See current price"}
              <span>
                {p.name === "Free"
                  ? "to get started"
                  : "in Telegram before purchase"}
              </span>
            </div>
            <ul className="check-list">
              {p.features.map((f) => (
                <li key={f}>
                  <Check />
                  {f}
                </li>
              ))}
            </ul>
            <a className="button button-small" href={practiceUrl}>
              {p.name === "Free" ? "Try PairTalk" : "See plans in Telegram"}{" "}
              <ArrowUpRight size={16} />
            </a>
          </article>
        ))}
      </section>
      <section className="container pricing-notes">
        <h2>Clear terms before you commit.</h2>
        <p>
          Plan prices and limits can change. The bot shows the current call
          allowance, maximum duration, recording limits, retention period, and
          price before you purchase. Telegram Stars and supported UZS card
          payments are available through the service. We don’t convert Stars
          into a fixed dollar price because your purchase cost can vary.
        </p>
        <h3>Refund eligibility</h3>
        <p>
          Under the existing refund policy, a request must be made within 48
          hours of purchase and less than 10% of the purchased call allowance
          must have been used. Other conditions apply; see the{" "}
          <a href="/terms#payments">subscription terms</a>. Use{" "}
          <code>/refund</code> in the bot or{" "}
          <a href={supportUrl}>contact support</a> for assistance.
        </p>
        <h3>Peer practice, with realistic expectations</h3>
        <p>
          Partners are other learners, not assigned professional tutors or
          official examiners. Matching depends on available partners. PairTalk
          does not guarantee an IELTS score or a matching time.
        </p>
      </section>
    </>
  );
}
