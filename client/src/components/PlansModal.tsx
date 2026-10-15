import { useRef, useState } from "react";
import { CreditCalculator } from "../../../platform/CreditCalculator";
import {
  CREDIT_TERMS_VERSION,
  type CreditBasket,
} from "../../../server/src/contracts/credits";
import { dashboardRequest, DashboardError } from "../services/dashboard";
import { CreditBalance } from "./CreditBalance";
import { LinkWithCopy, PendingIcon, CopyButton } from "./CopyLink";
import { useModalDialog } from "../hooks/useModalDialog";
import { X, ArrowUpRight, ChevronDown, Check } from "lucide-react";
import { usePricing } from "../../../platform/usePricing";
import { planPeriod } from "../../../server/src/contracts/pricing";
import { publicSiteUrl } from "../services/dashboard";

export interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
  inline?: boolean;
  initData?: string;
  onPurchased?: () => void;
}

export function PlansModal({
  isOpen,
  onClose,
  currentPlan = "FREE",
  inline = false,
  initData = "",
  onPurchased,
}: PlansModalProps) {
  const endpoint = `${(import.meta.env.VITE_SERVER_URL || "").replace(/\/+$/, "")}/api/public/plans`;
  const { data: pricing, loading, error, retry } = usePricing(endpoint, isOpen);
  const dialogRef = useModalDialog(isOpen && !inline, onClose);
  const [checkoutBusy, setCheckoutBusy] = useState(false),
    [checkoutError, setCheckoutError] = useState("");
  const [balanceRevision, setBalanceRevision] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const checkoutGuard = useRef(false);
  const checkout = async (basket: CreditBasket) => {
    if (checkoutGuard.current || !pricing?.credits) return;
    if (!initData) {
      selectPlan("credits");
      return;
    }
    checkoutGuard.current = true;
    const key = JSON.stringify({ basket, revision: pricing.credits.revision });
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const result = await dashboardRequest<{ invoiceUrl: string }>(
        initData,
        "/credits/checkout",
        {
          method: "POST",
          body: JSON.stringify({
            ...basket,
            revision: pricing.credits.revision,
            requestId: request.current!.id,
            termsAccepted: true,
            termsVersion: CREDIT_TERMS_VERSION,
          }),
        },
      );
      const tg = window.Telegram?.WebApp;
      if (tg?.openInvoice) {
        await new Promise<void>((resolve) =>
          tg.openInvoice(result.invoiceUrl, (status: string) => {
            setBalanceRevision((n) => n + 1);
            if (status === "paid") {
              request.current = null;
              onPurchased?.();
            } else if (status === "failed") {
              request.current = null;
              setCheckoutError(
                "Payment was not completed. Check your balance before trying again.",
              );
            }
            resolve();
          }),
        );
      } else window.open(result.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (
        error instanceof DashboardError &&
        [400, 409].includes(error.status)
      ) {
        request.current = null;
        setBalanceRevision((n) => n + 1);
      }
      setCheckoutError(
        error instanceof Error ? error.message : "Checkout is unavailable.",
      );
    } finally {
      checkoutGuard.current = false;
      setCheckoutBusy(false);
    }
  };
  if (!isOpen) return null;
  const botUsername =
    pricing?.botUsername ||
    (import.meta.env.VITE_BOT_USERNAME || "PairTalkBot").replace(/^@/, "");
  const selectPlan = (id: string) => {
    const url = `https://t.me/${botUsername}?start=${id === "credits" ? "credits" : `upgrade_${id.toLowerCase()}`}`;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.HapticFeedback?.impactOccurred?.("medium");
      tg.openTelegramLink(url);
    } else window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className={inline ? "plans-inline" : "dashboard-modal-overlay"}>
      <div
        ref={inline ? undefined : dialogRef}
        className={inline ? "plans-content" : "dashboard-modal plans-dialog"}
        role={inline ? undefined : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label="Calls and recordings"
        tabIndex={inline ? undefined : -1}
      >
        {!inline && (
          <>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close plans modal"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <div className="plans-heading">
              <h2>Calls and recordings</h2>
            </div>
          </>
        )}
        {loading && (
          <p role="status" className="loading-state">
            <PendingIcon />
            Checking current plans…
          </p>
        )}
        {error && (
          <div role="alert" className="dashboard-alert">
            <p>{error}</p>
            <button type="button" className="secondary-button" onClick={retry}>
              Retry prices
            </button>
          </div>
        )}
        {pricing?.credits && (
          <CreditBalance initData={initData} revision={balanceRevision} />
        )}
        {!loading &&
          pricing &&
          !pricing.credits &&
          pricing.plans.filter((plan) => plan.id !== "FREE").length === 0 && (
            <p>No paid plans are currently available.</p>
          )}
        {pricing?.credits && (
          <>
            <CreditCalculator
              catalog={pricing.credits}
              termsUrl={new URL("terms#payments", publicSiteUrl).toString()}
              onCheckout={(basket) => void checkout(basket)}
              busy={checkoutBusy || loading}
              checkoutLabel="Pay with Telegram Stars"
            />
            {checkoutError && (
              <p role="alert" className="dashboard-alert">
                {checkoutError}
              </p>
            )}
            <p className="credit-shop__note">
              Existing subscription allowances remain available. Purchased
              recordings cover calls up to 15 minutes. Use /refund in the bot
              for a full unused-purchase refund within 48 hours.
            </p>
          </>
        )}
        {!pricing?.credits && (
          <div className="plan-options">
            {pricing?.plans
              .filter((plan) => plan.id !== "FREE")
              .map((plan) => {
                const active = currentPlan.toUpperCase() === plan.id;
                return (
                  <article
                    className={`plan-option pcard${active ? " is-current" : ""}`}
                    key={plan.id}
                  >
                    <div className="pcard__head">
                      <h3>{plan.name}</h3>
                      {active && (
                        <span className="chip chip--ok">Current plan</span>
                      )}
                    </div>
                    <p className="pcard__price">
                      <b>{plan.prices.XTR.toLocaleString("en-US")} Stars</b> ·{" "}
                      {plan.prices.UZS.toLocaleString("en-US")} UZS
                    </p>
                    <ul>
                      <li>
                        <Check aria-hidden="true" size={16} />
                        {plan.unlimitedCalls ? "Unlimited" : plan.calls} calls
                        per {planPeriod(plan)}
                      </li>
                      <li>
                        <Check aria-hidden="true" size={16} />
                        Up to {plan.maxCallMinutes} minutes per call
                      </li>
                      <li>
                        <Check aria-hidden="true" size={16} />
                        {plan.recordings} recordings, kept {plan.retentionDays}{" "}
                        days
                      </li>
                    </ul>
                    {!active && (
                      <button
                        type="button"
                        className="primary-button"
                        aria-label={`Choose ${plan.name}`}
                        disabled={loading}
                        onClick={() => selectPlan(plan.id)}
                      >
                        Pay in Telegram{" "}
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </button>
                    )}
                    {!inline && !active && (
                      <CopyButton
                        value={`https://t.me/${botUsername}?start=upgrade_${plan.id.toLowerCase()}`}
                        label={`${plan.name} purchase link`}
                      />
                    )}
                  </article>
                );
              })}
          </div>
        )}
        {!inline && (
          <div className="plans-policies">
            <LinkWithCopy
              url={new URL("pricing", publicSiteUrl).toString()}
              label="Open the full comparison"
            />
            <details>
              <summary>
                Payment and refund details{" "}
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <p>
                Stars and UZS are separately quoted prices. The cost of
                obtaining Telegram Stars can vary by purchase method. Confirm
                the final invoice before paying.
              </p>
              <p>
                You can request a full refund for a full unused purchase
                within 48 hours. Legacy subscription refunds retain their
                original eligibility. Purchase state and account restrictions
                also apply.
              </p>
              <LinkWithCopy
                url={new URL("refund-policy", publicSiteUrl).toString()}
                label="Read the refund policy"
              />
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
