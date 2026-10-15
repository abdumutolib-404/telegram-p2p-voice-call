import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../api/client";
import { useUnsavedChanges } from "../../hooks/useAdminTools";
import {
  creditRates,
  sellingCreditRates,
  validateCreditCosts,
  type CreditCostInputs,
} from "../../../../server/src/contracts/credits";

const fields: {
  key: Exclude<keyof CreditCostInputs, "salesEnabled">;
  label: string;
  step: string;
  min: number;
}[] = [
  { key: "callPriceUzs", label: "Selling price (UZS/call)", step: "1", min: 1 },
  { key: "callPriceStars", label: "Selling price (Stars/call)", step: "1", min: 1 },
  { key: "recordingPriceUzs", label: "Selling price (UZS/recording)", step: "1", min: 1 },
  { key: "recordingPriceStars", label: "Selling price (Stars/recording)", step: "1", min: 1 },
  { key: "storagePriceUzs", label: "30-day storage (UZS/recording)", step: "1", min: 1 },
  {
    key: "recordingAllowanceMinutes",
    label: "Monthly recording capacity (minutes)",
    step: "1",
    min: 16,
  },
  {
    key: "recordingExternalUsedMinutes",
    label: "Reserved capacity for other usage (minutes)",
    step: "1",
    min: 0,
  },
  {
    key: "monthlyBudgetUsd",
    label: "Total monthly operating budget (USD)",
    step: "0.01",
    min: 0,
  },
  {
    key: "paidCalls",
    label: "Expected paid calls used / month",
    step: "1",
    min: 1,
  },
  {
    key: "paidRecordings",
    label: "Expected paid recordings used / month",
    step: "1",
    min: 1,
  },
  {
    key: "callSharePercent",
    label: "Call share of remaining shared costs (%)",
    step: "any",
    min: 0.000001,
  },
  {
    key: "participantMinuteUsd",
    label: "Cost per participant minute (USD)",
    step: "any",
    min: 0,
  },
  {
    key: "recordingMinuteUsd",
    label: "Cost per mixed recording minute (USD)",
    step: "any",
    min: 0,
  },
  {
    key: "recordingDeliveryUsd",
    label: "Temporary storage and delivery per recording (USD)",
    step: "any",
    min: 0,
  },
  {
    key: "storagePerRecordingUsd",
    label: "Additional 30-day storage per recording (USD)",
    step: "any",
    min: 0,
  },
  {
    key: "uzsPerUsd",
    label: "UZS per USD — costing reference",
    step: "any",
    min: 0.000001,
  },
  {
    key: "usdPerStar",
    label: "Net developer proceeds per Star (USD)",
    step: "any",
    min: 0.000001,
  },
];
export function CreditPricingEditor() {
  const [costs, setCosts] = useState<CreditCostInputs | null>(null),
    [saved, setSaved] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const submitting = useRef(false);
  const dirty = costs !== null && JSON.stringify(costs) !== saved;
  useUnsavedChanges(dirty);
  useEffect(() => {
    const controller = new AbortController();
    void adminFetch<{ costs: CreditCostInputs }>("/api/admin/credit-pricing", {
      signal: controller.signal,
    })
      .then((result) => {
        setCosts(result.costs);
        setSaved(JSON.stringify(result.costs));
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Prices are unavailable.",
          );
      });
    return () => controller.abort();
  }, [attempt]);
  let rates: ReturnType<typeof creditRates> | null = null;
  if (costs)
    try {
      rates = sellingCreditRates(costs);
    } catch {
      /* Preview is available only for valid inputs. */
    }
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!costs || submitting.current) return;
    try {
      validateCreditCosts(costs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check cost inputs.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminFetch<{ costs: CreditCostInputs }>(
        "/api/admin/credit-pricing",
        { method: "PUT", body: JSON.stringify(costs) },
      );
      setCosts(result.costs);
      setSaved(JSON.stringify(result.costs));
      setNotice(
        "Prices saved. New checkouts use these rates; existing purchases keep their purchases.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prices could not be saved.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <section
      className="glass-panel"
      style={{ padding: 24, marginBottom: 24 }}
      aria-labelledby="credit-pricing-title"
    >
      <h2 id="credit-pricing-title">Prices and operating costs</h2>
      <p>
        Each call and recording covers up to 15 minutes.
        New accounts receive three starter calls once. Paid balances do not
        expire.
      </p>
      <p>
        The budget includes infrastructure, starter usage, AI and other shared
        expenses. We subtract forecast direct call and recording costs first,
        then allocate the remaining budget once. The estimate adds 12% to
        expenditure. Published selling prices are set independently above;
        changing cost assumptions does not change them. Optional storage is separate.
      </p>
      <p className="field-help">
        Launch assumptions: $25 total operating costs, 100 paid calls and three
        paid recordings. Shared costs initially divide equally per paid unit:
        100/103 to calls, 3/103 to recordings. Direct rates use the
        researched paid-provider benchmark, even while free allowances reduce
        the actual bill. Currency and storage inputs are dated planning
        estimates; update them from actual costs.
      </p>
      <p className="field-help">
        The free recording pool starts at 60 minutes per UTC month. Each
        15-minute recording reserves 16 minutes, including a safety buffer.
        Recordings, existing purchase balances and pending purchases reduce
        available sales. Reserve minutes here for provider usage outside this
        app; this setting does not upgrade your provider plan.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
          {!costs && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              Retry
            </button>
          )}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!costs && !error && <p role="status">Loading prices…</p>}
      {costs && (
        <form onSubmit={(event) => void save(event)}>
          <fieldset
            disabled={busy}
            style={{
              border: 0,
              padding: 0,
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(100%,240px),1fr))",
              gap: 16,
            }}
          >
            {fields.map((field) => (
              <label className="field-label" key={field.key} style={{display:'grid',gridTemplateRows:'minmax(32px,auto) auto',gap:8,alignContent:'start'}}>
                {field.label}
                <input
                  className="input-modern"
                  type="number"
                  required
                  min={field.min}
                  max={field.key === "callSharePercent" ? 99.999999 : 1000000}
                  step={field.step}
                  value={Number.isNaN(costs[field.key]) ? "" : costs[field.key]}
                  onChange={(event) => {
                    setNotice("");
                    setCosts({
                      ...costs,
                      [field.key]:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    });
                  }}
                />
              </label>
            ))}
          </fieldset>
          <label
            className="field-label"
            style={{ margin: "20px 0", display: "block" }}
          >
            <input
              type="checkbox"
              checked={costs.salesEnabled}
              onChange={(event) =>
                setCosts({ ...costs, salesEnabled: event.target.checked })
              }
              disabled={busy}
            />{" "}
            Accept new purchases
          </label>
          {rates && (
            <div
              className="table-container"
              role="region"
              tabIndex={0}
              aria-label="Calculated prices"
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Service</th>
                    <th scope="col">Allocated cost (USD)</th>
                    <th scope="col">Cost + 12% estimate (UZS)</th>
                    <th scope="col">Selling price (UZS)</th>
                    <th scope="col">Stars before basket rounding</th>
                  </tr>
                </thead>
                <tbody>
                  {(["CALL", "RECORDING", "STORAGE"] as const).map((kind) => (
                    <tr key={kind}>
                      <th scope="row">
                        {kind === "CALL"
                          ? "15-minute call"
                          : kind === "RECORDING"
                            ? "15-minute recording"
                            : "30-day storage"}
                      </th>
                      <td>{(rates![kind].costMicros / 1e6).toFixed(6)}</td>
                      <td>{creditRates(costs)[kind].uzs.toLocaleString("en-US", {maximumFractionDigits:2})}</td>
                      <td>
                        {rates![kind].uzs.toLocaleString("en-US", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td>{rates![kind].stars.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="field-help">
            Calls and recordings use the same published catalog across the
            landing page, Mini App and Telegram. Actual invoices round the
            entire selected basket once to whole Stars. UZS figures explain
            costs; new checkout uses Stars.
          </p>
          <button
            className="btn-primary"
            type="submit"
            disabled={!dirty || busy || !rates}
          >
            {busy ? "Saving…" : "Save prices"}
          </button>
        </form>
      )}
    </section>
  );
}
