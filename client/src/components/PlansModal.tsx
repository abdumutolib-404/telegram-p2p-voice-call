import { LinkWithCopy, PendingIcon, CopyButton } from './CopyLink';
import { useModalDialog } from '../hooks/useModalDialog';
import { X, ArrowUpRight, ChevronDown } from 'lucide-react';
import { usePricing } from '../../../platform/usePricing';
import { planPeriod } from '../../../server/src/contracts/pricing';
import { publicSiteUrl } from '../services/dashboard';

export interface PlansModalProps { isOpen: boolean; onClose: () => void; currentPlan?: string }

export function PlansModal({ isOpen, onClose, currentPlan = 'FREE' }: PlansModalProps) {
  const endpoint = `${(import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '')}/api/public/plans`;
  const { data: pricing, loading, error, retry } = usePricing(endpoint, isOpen);
  const dialogRef = useModalDialog(isOpen, onClose);
  if (!isOpen) return null;
  const botUsername = pricing?.botUsername || (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');
  const selectPlan = (id: string) => {
    const url = `https://t.me/${botUsername}?start=upgrade_${id.toLowerCase()}`;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.HapticFeedback?.impactOccurred?.('medium');
      tg.openTelegramLink(url);
    } else window.open(url, '_blank', 'noopener,noreferrer');
  };
  return <div className="dashboard-modal-overlay">
    <div ref={dialogRef} className="dashboard-modal plans-dialog" role="dialog" aria-modal="true" aria-label="Practice plans" tabIndex={-1}>
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close plans modal"><X size={20} aria-hidden="true" /></button>
      <div className="plans-heading"><h2>Choose your plan</h2><p>Compare your practice allowance. Complete your purchase in Telegram.</p></div>
      {loading && <p role="status" className="loading-state"><PendingIcon />Checking current plans…</p>}
      {error && <div role="alert" className="dashboard-alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry prices</button></div>}
      {!loading && pricing && pricing.plans.filter(plan => plan.id !== 'FREE').length === 0 && <p>No paid plans are currently available.</p>}
      <div className="plan-options">
        {pricing?.plans.filter(plan => plan.id !== 'FREE').map(plan => {
          const active = currentPlan.toUpperCase() === plan.id;
          return <article className={`plan-option${active ? ' is-current' : ''}`} key={plan.id}>
            <h3>{plan.name}{active && <span className="subtle-label"> · Current</span>}</h3>
            <p className="plan-price">{plan.prices.XTR.toLocaleString('en-US')} Stars</p>
            <p className="plan-secondary-price">{plan.prices.UZS.toLocaleString('en-US')} UZS · {plan.validityDays}-day period</p>
            <dl>
              <div><dt>Call allowance</dt><dd>{plan.unlimitedCalls ? 'Unlimited' : plan.calls} calls per {planPeriod(plan)}</dd></div>
              <div><dt>Maximum call length</dt><dd>{plan.maxCallMinutes} minutes</dd></div>
              <div><dt>Recordings per period</dt><dd>{plan.recordings}</dd></div>
              <div><dt>Audio retention</dt><dd>{plan.retentionDays} days</dd></div>
            </dl>
            <button type="button" className={active ? 'secondary-button' : 'primary-button'} disabled={active || loading} onClick={() => selectPlan(plan.id)}>{active ? 'Current plan' : `Choose ${plan.name}`} {!active && <ArrowUpRight size={17} aria-hidden="true" />}</button>
            {!active && <CopyButton value={`https://t.me/${botUsername}?start=upgrade_${plan.id.toLowerCase()}`} label={`${plan.name} purchase link`} />}
          </article>;
        })}
      </div>
      <div className="plans-policies">
        <LinkWithCopy url={new URL('pricing', publicSiteUrl).toString()} label="Open the full comparison" />
        <details><summary>Payment and refund details <ChevronDown size={15} aria-hidden="true" /></summary>
          <p>Stars and UZS are separately quoted prices. The cost of obtaining Telegram Stars can vary by purchase method. Confirm the final invoice before paying.</p>
          <p>You can request a full refund within 48 hours of purchase or when less than 10% of the purchased call allowance is used. Purchase state and account restrictions also apply.</p>
          <LinkWithCopy url={new URL('privacy#refunds', publicSiteUrl).toString()} label="Read the refund policy" />
        </details>
      </div>
    </div>
  </div>;
}
