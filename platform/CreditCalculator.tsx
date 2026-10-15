import { useState } from "react";
import {
  quoteCredits,
  type CreditBasket,
  type CreditCatalog,
} from "../server/src/contracts/credits";
import "./credit-calculator.css";

export function CreditCalculator({
  catalog,
  onCheckout,
  busy = false,
  checkoutLabel = "Choose credits in Telegram",
  termsUrl = "/terms#payments",
}: {
  catalog: CreditCatalog;
  onCheckout: (basket: CreditBasket) => void;
  busy?: boolean;
  checkoutLabel?: string;
  termsUrl?: string;
}) {
  const [basket, setBasket] = useState<CreditBasket>(() => {
    const fallback = { calls: 5, recordings: 0, storage: false };
    if (typeof window === "undefined") return fallback;
    const query = new URLSearchParams(window.location.search);
    if (!query.has("creditCalls") || !query.has("creditRecordings"))
      return fallback;
    const initial = {
      calls: Number(query.get("creditCalls")),
      recordings: Number(query.get("creditRecordings")),
      storage: query.get("creditStorage") === "1",
    };
    try {
      quoteCredits(catalog, initial);
      return initial;
    } catch {
      return fallback;
    }
  });
  const [invalid, setInvalid] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const capacityExceeded = basket.recordings > catalog.recordingsAvailable;
  let total: ReturnType<typeof quoteCredits> | null = null;
  try {
    total = invalid ? null : quoteCredits(catalog, basket);
  } catch {
    /* Empty and invalid baskets cannot enter checkout. */
  }
  const money = (n: number) =>
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const quantity = (kind: "calls" | "recordings", raw: string) => {
    const n = raw === "" ? NaN : Number(raw);
    setBasket((previous) => ({
      ...previous,
      [kind]: n,
      storage: kind === "recordings" && n === 0 ? false : previous.storage,
    }));
    setInvalid(!Number.isInteger(n) || n < 0 || n > 1000);
  };
  return (
    <div className="credit-shop">
      <div className="credit-shop__intro">
        <span className="credit-shop__eyebrow">Practice on your terms</span>
        <h2>Buy what you’ll use.</h2>
        <p>
          Calls and recordings are separate. Paid credits do not expire, and
          there is no monthly subscription.
        </p>
      </div>
      <div className="credit-shop__rates">
        <article>
          <h3>Call credit</h3>
          <strong>
            {money(catalog.rates.CALL.uzs)} <small>UZS / credit</small>
          </strong>
          <p>
            One participant’s call, up to 15 minutes. Matching and IELTS prompts
            included.
          </p>
        </article>
        <article>
          <h3>Recording credit</h3>
          <strong>
            {money(catalog.rates.RECORDING.uzs)} <small>UZS / credit</small>
          </strong>
          <p>
            One call recording, up to 15 minutes. Both voices included, with
            both partners’ permission.
          </p>
        </article>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (total && accepted && !capacityExceeded && !busy && catalog.salesEnabled)
            onCheckout(basket);
        }}
      >
        <div className="credit-shop__quantities">
          <label>
            Call credits
            <input
              type="number"
              min={0}
              max={1000}
              step={1}
              required
              value={Number.isNaN(basket.calls) ? "" : basket.calls}
              onChange={(event) => quantity("calls", event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Recording credits
            <input
              type="number"
              min={0}
              max={catalog.recordingsAvailable}
              step={1}
              required
              value={Number.isNaN(basket.recordings) ? "" : basket.recordings}
              onChange={(event) => quantity("recordings", event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <p className="credit-shop__note" role="status">
          {catalog.recordingsAvailable === 0
            ? "Recording credits are temporarily sold out. You can still buy call credits."
            : `${catalog.recordingsAvailable} recording credits available from the current shared capacity. Availability is checked again at checkout.`}
          {capacityExceeded && " Reduce recording quantity to continue."}
        </p>
        <label className="credit-shop__storage">
          <input
            type="checkbox"
            checked={basket.storage}
            disabled={!basket.recordings || busy}
            onChange={(event) =>
              setBasket((previous) => ({
                ...previous,
                storage: event.target.checked,
              }))
            }
          />
          <span>
            <b>Add 30-day storage</b>
            <br />
            {money(catalog.rates.STORAGE.uzs)} UZS for each selected recording.
            Storage credits apply automatically to your next credit recordings.
          </span>
        </label>
        <p className="credit-shop__note">
          Without storage, audio is delivered to Telegram and kept temporarily
          for delivery recovery, up to 24 hours. Download your own copy. With
          storage, 30 days starts when the recording is created.
        </p>
        <div className="credit-shop__total" aria-live="polite">
          {total ? (
            <>
              <span>Total for your selection</span>
              <strong>{total.uzs.toLocaleString("en-US")} UZS</strong>
              <span>
                {total.stars.toLocaleString("en-US")} Telegram Stars at checkout
              </span>
            </>
          ) : (
            <span>
              Select at least one call or recording. Quantities must be whole
              numbers from 0 to 1,000.
            </span>
          )}
        </div>
        <p className="credit-shop__note">
          UZS is a cost reference; payment is in Telegram Stars. The total is
          rounded once for the whole purchase. The amount you pay to obtain
          Stars can vary.
        </p>
        <label className="credit-shop__storage">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            disabled={busy}
          />
          <span>
            I agree to the credit purchase terms below and the{" "}
            <a href={termsUrl} target="_blank" rel="noreferrer">
              payment terms
            </a>
            , including the 48-hour full unused-credit refund rule.
          </span>
        </label>
        <button
          type="submit"
          className="credit-shop__buy"
          disabled={!total || !accepted || capacityExceeded || busy || !catalog.salesEnabled}
        >
          {busy
            ? "Opening checkout…"
            : catalog.salesEnabled
              ? checkoutLabel
              : "Credit sales paused"}
        </button>
        <p className="credit-shop__note">
          A credit is reserved when a call starts. Failed connections and calls
          under five seconds return it. A recording credit is charged when a
          usable audio file is ready; failed exports return it. Reconnecting
          never uses another call credit.
        </p>
      </form>
    </div>
  );
}
