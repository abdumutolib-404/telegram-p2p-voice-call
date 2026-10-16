import { CreditCalculator } from "../../../platform/CreditCalculator";
import { PracticeCalculator } from "../../../platform/PracticeCalculator";
import { SectionFaq } from "../../../platform/SectionFaq";
import { pricingQuestions } from "../../../platform/practiceQuestions";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { practiceUrl, supportUrl } from "./SiteLayout";
import { usePricing } from "../../../platform/usePricing";
import {
  formatPlanPrice,
  matchesNeeds,
  planCheckoutUrl,
  planPeriod,
  pricePerIncludedCall,
  recommendPlan,
  type PricingCurrency,
  type PracticeNeeds,
  type PublicPricing,
} from "../../../server/src/contracts/pricing";

export function PricingPage({
  initialPricing = null,
}: {
  initialPricing?: PublicPricing | null;
}) {
  const endpoint =
    import.meta.env.VITE_PUBLIC_PRICING_URL || "/api/public/plans";
  const { data, loading, error, retry } = usePricing(
    endpoint,
    true,
    initialPricing,
  );
  const [currency, setCurrency] = useState<PricingCurrency>("XTR");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pairtalk-pricing-currency");
      if (saved === "XTR" || saved === "UZS") setCurrency(saved);
    } catch {
      /* Storage is optional. */
    }
  }, []);
  const chooseCurrency = (value: PricingCurrency) => {
    setCurrency(value);
    try {
      localStorage.setItem("pairtalk-pricing-currency", value);
    } catch {
      /* Storage is optional. */
    }
  };
  const [needs, setNeeds] = useState<PracticeNeeds>({
    calls: 10,
    minutes: 15,
    recordings: 0,
    retentionDays: 30,
  });
  const recommendation = data
    ? recommendPlan(data.plans, needs, currency)
    : undefined;
  const fields: {
    key: keyof PracticeNeeds;
    label: string;
    min: number;
    max: number;
  }[] = [
    { key: "calls", label: "Calls you need", min: 0, max: 1000000 },
    { key: "minutes", label: "Minutes per call", min: 1, max: 1440 },
    { key: "recordings", label: "Recordings you need", min: 0, max: 1000000 },
    {
      key: "retentionDays",
      label: "Days to keep each recording",
      min: 1,
      max: 3650,
    },
  ];
  if (data?.credits)
    return (
      <>
        <section className="wrap page-head practice-pricing-head">
          <h1>Pay for the practice you need.</h1>
          <p>
            Join @pairtalk to claim three free 15-minute call units, then choose
            calls and recordings separately. No subscription required.
          </p>
          <a className="btn btn--primary" href="#practice-pack">Buy credits</a>
        </section>
        <section className="wrap section practice-pricing-body" id="practice-pack" aria-label="Choose calls and recordings">
          {data.packs ? <PracticeCalculator catalog={data.packs} busy={loading} checkoutLabel="Continue in Telegram" onCheckout={pack=>{window.location.href=`https://t.me/${data.botUsername}?start=pack_${pack.calls}_${pack.recordings}_${pack.retention?1:0}_${pack.minutes}`;}}/> : <CreditCalculator
            catalog={data.credits}
            busy={loading}
            onCheckout={(basket) => {
              window.location.href = `https://t.me/${data.botUsername}?start=credits_${basket.calls}_${basket.recordings}_${basket.storage ? 1 : 0}`;
            }}
          />}
          {error && <p role="alert">{error}</p>}
          <p className="pricing-fineprint">
            Prices checked{" "}
            {data.credits.checkedAt.slice(0, 16).replace("T", " ")} UTC. Future price
            changes apply to new purchases. Existing purchases keep
            their service entitlement.
          </p>
          <p className="pricing-fineprint">
            Full unused purchases may be refunded within 48 hours using
            /refund in Telegram. Existing subscription benefits and their
            original refund terms remain available.{" "}
            <a href="/refund-policy">Refund policy</a> ·{" "}
            <a href="/terms#payments">Payment terms</a>
          </p>
          <SectionFaq title="Questions about your purchase" questions={pricingQuestions} />
        </section>
      </>
    );
  return (
    <>
      <section className="wrap page-head">
        <h1>Pick the amount of practice you need.</h1>
        <p>
          Compare current PairTalk prices and allowances. Choose what fits your
          routine, then register or pay securely in Telegram.
        </p>
        <a className="text-link" href="#compare-plans">
          Compare prices and features ↓
        </a>
      </section>
      <section className="wrap card finder" aria-labelledby="needs-title">
        <div className="card__head">
          <h2 className="h3" id="needs-title">
            What does your routine look like?
          </h2>
          <div className="seg" role="group" aria-label="Compare prices in">
            {(["XTR", "UZS"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={currency === value}
                onClick={() => chooseCurrency(value)}
              >
                {value === "XTR" ? "Telegram Stars" : "Uzbek sum"}
              </button>
            ))}
          </div>
        </div>
        <div className="finder__grid">
          {fields.map((field) => (
            <label className="field" key={field.key}>
              {field.label}
              <input
                className="input num"
                type="number"
                min={field.min}
                max={field.max}
                step={1}
                value={needs[field.key]}
                disabled={
                  field.key === "retentionDays" && needs.recordings === 0
                }
                onChange={(event) => {
                  const number = Number(event.target.value);
                  setNeeds((previous) => ({
                    ...previous,
                    [field.key]: Math.max(
                      field.min,
                      Math.min(
                        field.max,
                        Number.isFinite(number)
                          ? Math.floor(number)
                          : field.min,
                      ),
                    ),
                  }));
                }}
              />
            </label>
          ))}
        </div>
        <p className="pricing-fineprint">
          Compare needs for one allowance period. Free uses a calendar month;
          paid plans show their validity below. Recording retention matters only
          when you need recordings.
        </p>
        <div className="finder__result" role="status">
          {loading ? (
            "Checking current prices…"
          ) : error ? (
            "Current prices could not be verified."
          ) : !data?.plans.length ? (
            "There are no published plans available right now."
          ) : recommendation ? (
            <>
              <Check size={22} aria-hidden="true" />
              <span>
                <strong>{recommendation.name}</strong> is the lowest-priced
                option in {currency === "XTR" ? "Stars" : "UZS"} that meets
                these needs.
              </span>
            </>
          ) : (
            <span>
              No current plan covers all these needs. Adjust them or{" "}
              <a href={supportUrl}>contact support</a>.
            </span>
          )}
        </div>
        {data && !loading && (
          <p className="pricing-fineprint">
            Prices checked{" "}
            <time dateTime={data.checkedAt}>
              {data.checkedAt.slice(0, 16).replace("T", " ")} UTC
            </time>
            . Your dashboard and Telegram checkout use the same prices.
          </p>
        )}
        {error && (
          <div className="pricing-error" role="alert">
            <p>{error}</p>
            <button className="btn btn--primary" type="button" onClick={retry}>
              <RefreshCw size={16} /> Retry prices
            </button>
            <a className="text-link" href={practiceUrl}>
              Check in Telegram ↗
            </a>
          </div>
        )}
      </section>
      <section
        id="compare-plans"
        className="wrap section plans"
        aria-label="Current PairTalk prices"
        aria-busy={loading}
      >
        {data?.plans.map((plan) => {
          const fits = matchesNeeds(plan, needs);
          const average = pricePerIncludedCall(plan, currency);
          return (
            <article
              key={plan.id}
              className={`card plan ${recommendation?.id === plan.id ? "is-match" : ""}`}
            >
              <div className="plan__tag">
                {recommendation?.id === plan.id ? (
                  <span className="chip chip--ok">Fits your routine</span>
                ) : fits ? (
                  <span className="chip">Meets your needs</span>
                ) : null}
              </div>
              <h2 className="h3">{plan.name}</h2>
              <p className="muted">
                {plan.id === "FREE"
                  ? "Find your rhythm."
                  : plan.id === "PLUS"
                    ? "Make it a habit."
                    : plan.id === "PRO"
                      ? "Keep your momentum."
                      : "Room for more."}
              </p>
              <div className="plan__price num">
                {formatPlanPrice(plan, currency)}
                <small>
                  per {planPeriod(plan)} ·{" "}
                  {formatPlanPrice(plan, currency === "XTR" ? "UZS" : "XTR")}
                </small>
              </div>
              <ul className="plan__rows">
                <li>
                  <Check className="i" aria-hidden="true" />
                  {plan.unlimitedCalls ? "Unlimited" : plan.calls} calls per{" "}
                  {planPeriod(plan)}
                </li>
                <li>
                  <Check className="i" aria-hidden="true" />
                  Up to {plan.maxCallMinutes} minutes per call
                </li>
                <li>
                  <Check className="i" aria-hidden="true" />
                  {plan.recordings}{" "}
                  {plan.recordings === 1 ? "recording" : "recordings"} per
                  period
                </li>
                <li>
                  <Check className="i" aria-hidden="true" />
                  {plan.retentionDays}{" "}
                  {plan.retentionDays === 1 ? "day" : "days"} of recording
                  retention
                </li>
              </ul>
              {average !== null && (
                <p className="pricing-average">
                  ≈{" "}
                  {average.toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  {currency === "XTR" ? "Stars" : "UZS"} per included call when
                  you use the full allowance.
                </p>
              )}
              <a
                className={`btn btn--block ${recommendation?.id === plan.id ? "btn--primary" : "btn--secondary"}`}
                href={
                  loading ? undefined : planCheckoutUrl(data.botUsername, plan)
                }
                aria-disabled={loading}
              >
                {plan.id === "FREE"
                  ? "Start in Telegram"
                  : `Choose ${plan.name}`}{" "}
                <ArrowUpRight size={16} />
              </a>
            </article>
          );
        })}
      </section>
      <section className="container pricing-notes">
        <h2>Know exactly what is included.</h2>
        <p>
          These are bundled subscription prices. The per-call figure divides the
          full price by the included call allowance; it is not a separate call
          purchase price. Recordings and storage are included as shown. Unused
          paid allowances expire with the subscription period. Independent
          these purchases are not currently sold.
        </p>
        {data && data.plans.length > 0 && (
          <div
            className="pricing-table-wrap"
            role="region"
            tabIndex={0}
            aria-label="Detailed plan comparison"
          >
            <table className="pricing-table">
              <caption>Compare every current plan</caption>
              <thead>
                <tr>
                  <th scope="col">Included</th>
                  {data.plans.map((plan) => (
                    <th scope="col" key={plan.id}>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Price",
                    ...data.plans.map((plan) =>
                      formatPlanPrice(plan, currency),
                    ),
                  ],
                  [
                    "Allowance period",
                    ...data.plans.map((plan) => planPeriod(plan)),
                  ],
                  [
                    "Calls",
                    ...data.plans.map((plan) =>
                      plan.unlimitedCalls ? "Unlimited" : String(plan.calls),
                    ),
                  ],
                  [
                    "Minutes per call",
                    ...data.plans.map((plan) => String(plan.maxCallMinutes)),
                  ],
                  [
                    "Recordings",
                    ...data.plans.map((plan) => String(plan.recordings)),
                  ],
                  [
                    "Recording retention",
                    ...data.plans.map(
                      (plan) =>
                        `${plan.retentionDays} ${plan.retentionDays === 1 ? "day" : "days"}`,
                    ),
                  ],
                ].map((row) => (
                  <tr key={row[0]}>
                    <th scope="row">{row[0]}</th>
                    {row.slice(1).map((cell, index) => (
                      <td key={data.plans[index].id}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>One platform, one price list.</h3>
        <p>
          The same published prices power this comparison, your account’s plan
          choices and Telegram checkout. The invoice confirms the exact charge
          before payment. Account-specific rewards and allowances appear in your
          dashboard.
        </p>
        <h3>Stars and UZS</h3>
        <p>
          These are separate quoted prices, not a fixed currency conversion. The
          cost of purchasing Stars can vary by region and payment channel. Your
          invoice identifies the currency you pay.
        </p>
        <h3>Refund eligibility</h3>
        <p>
          The current bot policy allows a request within 48 hours of purchase{" "}
          <strong>or</strong> when less than 10% of the purchased call allowance
          has been used. Ownership, purchase state and account restrictions also
          apply. Use <code>/refund</code> or{" "}
          <a href={supportUrl}>contact support</a>. See the{" "}
          <a href="/refund-policy">refund policy</a>,{" "}
          <a href="/terms#payments">subscription terms</a> and registration PDF.
        </p>
        <h3>Practice with people.</h3>
        <p>
          Partners are fellow learners. Availability and matching time vary; a
          plan does not guarantee an IELTS score or a particular partner.
        </p>
      </section>
    </>
  );
}
