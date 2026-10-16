import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCalculator } from "../../../platform/CreditCalculator";
import { PracticeCalculator } from "../../../platform/PracticeCalculator";
import { PracticeCheckout } from './PracticeCheckout';
import { ChannelOffers } from './ChannelOffers';
import { StarterGift } from './StarterGift';
import type { PracticePack, PracticeCatalog } from '../../../server/src/contracts/practicePacks';
import { isPracticeCatalog, quotePracticePack } from '../../../server/src/contracts/practicePacks';
import type { PracticeCheckoutSnapshot } from '../../../server/src/contracts/practiceCheckout';
import {
  CREDIT_TERMS_VERSION,
  type CreditBasket,
} from "../../../server/src/contracts/credits";
import { dashboardRequest, DashboardError } from "../services/dashboard";
import { CreditBalance } from "./CreditBalance";
import { SectionFaq } from "../../../platform/SectionFaq";
import { pricingQuestions } from "../../../platform/practiceQuestions";
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
type PracticeSelection={pack:PracticePack;catalog:PracticeCatalog;campaignId?:string;discountPercent?:number;expiresAt?:string;serverOffset?:number;orderId?:string;lockedCurrency?:'XTR'|'UZS'};
const selectionKey=(selection:PracticeSelection)=>JSON.stringify({pack:selection.pack,revision:selection.catalog.revision,campaignId:selection.campaignId??null});

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
  const [selection,setSelection]=useState<PracticeSelection|null>(null);
  const [checkoutNotice,setCheckoutNotice]=useState('');
  const dialogRef = useModalDialog(isOpen && !inline && !selection, onClose);
  const [checkoutBusy, setCheckoutBusy] = useState(false),
    [checkoutError, setCheckoutError] = useState("");
  const [balanceRevision, setBalanceRevision] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const checkoutGuard = useRef(false);
  const resumeRequested=useRef('');
  const resumeOrder=useCallback(async(id:string)=>{
    if(checkoutGuard.current||!initData)return;
    checkoutGuard.current=true;setCheckoutBusy(true);setCheckoutError('');
    try{
      const result=await dashboardRequest<PracticeCheckoutSnapshot>(initData,`/practice/orders/${id}`);
      if(!isPracticeCatalog(result.catalog)||!['XTR','UZS'].includes(result.currency)||!/^[a-f0-9-]{36}$/.test(result.requestId))throw new Error('Checkout details could not be verified.');
      const quote=quotePracticePack(result.pack,result.catalog.prices,result.discountPercent);
      if(quote.stars!==result.stars||quote.uzs!==result.uzs)throw new Error('Checkout prices changed unexpectedly. Review a current pack.');
      const next:PracticeSelection={pack:quote.pack,catalog:result.catalog,campaignId:result.campaignId,discountPercent:result.discountPercent,expiresAt:result.expiresAt,serverOffset:Date.parse(result.serverNow)-Date.now(),orderId:result.orderId,lockedCurrency:result.currency};
      request.current={key:selectionKey(next),id:result.requestId};setSelection(next);
    }catch(error){setCheckoutError(error instanceof Error?error.message:'Checkout could not be resumed.');}
    finally{checkoutGuard.current=false;setCheckoutBusy(false);}
  },[initData]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('resumeOrder');
    if(!isOpen||!initData||!id||!/^[a-f0-9-]{36}$/.test(id)||resumeRequested.current===id)return;
    resumeRequested.current=id;void resumeOrder(id);
  },[isOpen,initData,resumeOrder]);
  const cancelExisting=async()=>{
    if(!selection?.orderId||checkoutGuard.current)return;
    checkoutGuard.current=true;setCheckoutBusy(true);setCheckoutError('');
    try{await dashboardRequest(initData,`/practice/orders/${selection.orderId}/cancel`,{method:'POST',body:'{}'});request.current=null;setSelection(null);setBalanceRevision(n=>n+1);setCheckoutNotice('Checkout cancelled. You can choose another pack or payment method.');}
    catch(error){setCheckoutError(error instanceof Error?error.message:'Cancellation could not be confirmed.');}
    finally{checkoutGuard.current=false;setCheckoutBusy(false);}
  };
  const payPractice = async (currency:'XTR'|'UZS') => {
    if(checkoutGuard.current||!selection)return;
    if(!initData){selectPlan('credits');return;}
    checkoutGuard.current=true;setCheckoutBusy(true);setCheckoutError('');
    const key=selectionKey(selection);
    if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
    try{
      const result=await dashboardRequest<{orderId:string;invoiceUrl?:string;delivery?:string;claimed?:boolean}>(initData,'/practice/checkout',{method:'POST',body:JSON.stringify({...selection.pack,currency,campaignId:selection.campaignId,revision:selection.catalog.revision,requestId:request.current!.id,termsAccepted:true,termsVersion:CREDIT_TERMS_VERSION})});
      setSelection(previous=>previous?{...previous,orderId:result.orderId,lockedCurrency:currency}:null);
      const tg=window.Telegram?.WebApp;
      if(result.claimed){request.current=null;setSelection(null);setBalanceRevision(n=>n+1);setCheckoutNotice('Offer claimed. Your practice pack has been added to your balance.');onPurchased?.();return;}
      if(currency==='UZS'){
        if(!['QUEUED','SENT'].includes(result.delivery??''))throw new Error('Payment-message delivery could not be confirmed. Open the bot chat or contact /paysupport before transferring funds.');
        setSelection(null);
        request.current=null;
        if(tg?.close)tg.close();
        else selectPlan('credits');
        return;
      }
      if(!result.invoiceUrl)throw new Error('Telegram did not return an invoice. Retry this checkout.');
      if(tg?.openInvoice)await new Promise<void>(resolve=>tg.openInvoice(result.invoiceUrl!,(status:string)=>{
        setBalanceRevision(n=>n+1);
        if(status==='paid'){request.current=null;setSelection(null);onPurchased?.();}
        else if(status==='cancelled'){
          void dashboardRequest(initData,`/practice/orders/${result.orderId}/cancel`,{method:'POST',body:'{}'}).then(()=>{request.current=null;setSelection(previous=>previous?{...previous,orderId:undefined,lockedCurrency:undefined,expiresAt:previous.campaignId?previous.expiresAt:undefined}:null);setBalanceRevision(n=>n+1);}).catch(error=>setCheckoutError(error instanceof Error?error.message:'Cancellation could not be confirmed.')).finally(resolve);return;
        }
        else if(status==='failed')setCheckoutError('Payment was not completed. Check your balance before trying again.');
        resolve();
      }));
      else window.open(result.invoiceUrl,'_blank','noopener,noreferrer');
    }catch(error){
      if(error instanceof DashboardError&&error.status===409&&/already used or expired|Prices changed/.test(error.message)){request.current=null;if(/Prices changed/.test(error.message)){setSelection(null);retry();}}
      setCheckoutError(error instanceof Error?error.message:'Checkout is unavailable.');
    }
    finally{checkoutGuard.current=false;setCheckoutBusy(false);}
  };
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
          <CreditBalance initData={initData} revision={balanceRevision} onResume={id=>void resumeOrder(id)} />
        )}
        {pricing?.packs&&<StarterGift initData={initData} onClaimed={()=>{setBalanceRevision(n=>n+1);onPurchased?.();}}/>}
        {pricing?.packs&&<ChannelOffers initData={initData} revision={balanceRevision} onSelect={(offer,serverOffset)=>{setCheckoutError('');setSelection({pack:offer.pack,catalog:offer.catalog,campaignId:offer.id,discountPercent:offer.percent,expiresAt:offer.expiresAt,serverOffset});}}/>}
        {checkoutNotice&&<p role="status" className="dashboard-alert">{checkoutNotice}</p>}
        {!loading &&
          pricing &&
          !pricing.credits &&
          pricing.plans.filter((plan) => plan.id !== "FREE").length === 0 && (
            <p>No paid plans are currently available.</p>
          )}
        {pricing?.credits && (
          <>
            {pricing.packs ? <PracticeCalculator catalog={pricing.packs} busy={checkoutBusy||loading} onCheckout={pack=>{setCheckoutError('');setSelection({pack,catalog:pricing.packs!});}}/> : <CreditCalculator
              catalog={pricing.credits}
              termsUrl={new URL("terms#payments", publicSiteUrl).toString()}
              onCheckout={(basket) => void checkout(basket)}
              busy={checkoutBusy || loading}
              checkoutLabel="Pay with Telegram Stars"
            />}
            {checkoutError && (
              <p role="alert" className="dashboard-alert">
                {checkoutError}
              </p>
            )}
            <p className="credit-shop__note">
              Existing subscription allowances remain available. Purchased
              recordings use one balance unit per 15 minutes. Use /refund in the bot
              for a full unused-purchase refund within 48 hours.
            </p>
            <SectionFaq title="Before you buy" questions={pricingQuestions} />
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
      {selection&&<PracticeCheckout {...selection} busy={checkoutBusy} error={checkoutError} onClose={()=>{if(!checkoutGuard.current)setSelection(null);}} onPay={currency=>void payPractice(currency)} onCancelExisting={selection.orderId?()=>void cancelExisting():undefined}/>}
    </div>
  );
}
