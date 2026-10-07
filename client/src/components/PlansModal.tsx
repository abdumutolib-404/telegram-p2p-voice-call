import { useModalDialog } from '../hooks/useModalDialog';
import { Brand } from './Brand';
import React from 'react';
import { X, ShieldAlert, Sparkles, Clock, Phone, Mic, HardDrive, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { toPaidPlanInfo } from '../constants/plans';
import { usePricing } from '../../../platform/usePricing';
import { publicSiteUrl } from '../services/dashboard';

export interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  currentPlan = 'FREE',
}) => {
  const endpoint = `${(import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '')}/api/public/plans`;
  const { data: pricing, loading, error, retry } = usePricing(endpoint, isOpen);
  const plans = pricing?.plans.filter(plan => plan.id !== 'FREE').map(toPaidPlanInfo) || [];
  const dialogRef = useModalDialog(isOpen, onClose);
  if (!isOpen) return null;

  const botUsername = pricing?.botUsername || (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');

  const handleSelectPlan = (planId: string) => {
    const tg = window.Telegram?.WebApp;
    const upgradeUrl = `https://t.me/${botUsername}?start=upgrade_${planId.toLowerCase()}`;
    if (tg) {
      tg.HapticFeedback?.impactOccurred?.('medium');
      if (typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(upgradeUrl);
      } else {
        window.open(upgradeUrl, '_blank');
      }
    } else {
      window.open(upgradeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="client-modal-overlay">
      <div ref={dialogRef} className="client-modal max-w-lg" role="dialog" aria-modal="true" aria-label="Practice plans">
        <header className="modal-header"><Brand />
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close plans modal"
        >
          <X className="w-5 h-5" />
        </button>
        </header>

        {/* Header */}
        <div className="text-center mb-6 pr-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-sans font-bold tracking-wide uppercase border border-mint-500/40 text-mint-400 bg-mint-950/40 mb-2">
            <Sparkles className="w-3 h-3" />
            <span>UPGRADE PRACTICE CAPACITY</span>
          </div>
          <h2 className="text-xl md:text-2xl font-sans font-semibold tracking-tight text-white uppercase">
            Choose your plan
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-sans">
            Current prices and allowances come from the same catalog as PairTalk’s public comparison and Telegram checkout.
          </p>
        </div>

        {/* Server Refund Policy Notice Banner */}
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs leading-relaxed flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1 text-[11px]">
            <p className="font-sans font-bold tracking-wider uppercase text-amber-400">
              Refund eligibility
            </p>
            <p className="text-slate-300 font-sans text-[10.5px]">
              You can request a full refund <span className="text-amber-300 font-semibold">within 48 hours of purchase</span> or when <span className="text-amber-300 font-semibold">less than 10% of the purchased call allowance is used</span>. Purchase state and account restrictions also apply.
            </p>
          </div>
        </div>

        {/* Tax & Currency Difference Warning Banner */}
        <div className="mb-5 p-3 rounded-2xl bg-slate-900/90 border border-mint-500/30 text-slate-300 text-xs leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 text-mint-400 mt-0.5" />
          <p className="font-sans text-[10.5px] text-slate-400">
            <strong className="text-mint-300 uppercase">Payment currencies:</strong> Stars and UZS are separately quoted prices. The amount you pay to obtain Telegram Stars can vary by purchase method. Confirm the final invoice before paying.
          </p>
        </div>

        {loading && <p role="status">Checking current plans…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry prices</button></div>}
        {!loading && pricing && plans.length === 0 && <p>No paid plans are currently available.</p>}
        <p><a className="text-button" href={new URL('pricing', publicSiteUrl).toString()} target="_blank" rel="noreferrer">Compare every plan and your practice needs ↗</a></p>
        {/* Purchasable Plans Cards Grid (FREE excluded) */}
        <div className="space-y-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan.toUpperCase() === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative p-4 rounded-2xl border transition-all bg-gradient-to-b ${plan.bgGlow} ${plan.borderColor} ${
                  isCurrent ? 'ring-2 ring-mint-500 shadow-lg shadow-mint-500/20' : ''
                }`}
              >
                {/* Header Row */}
                <div className="plan-card-heading flex items-start justify-between mb-3 gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-base font-sans font-semibold tracking-wide uppercase ${plan.accentColor}`}>
                        {plan.name}
                      </h3>
                      <span className="px-2 py-0.5 text-[9px] font-sans font-bold uppercase rounded bg-black/50 border border-slate-700 text-slate-300">
                        {plan.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-sans">{plan.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-sans font-semibold text-white flex items-center justify-end gap-1">
                      <span>⭐</span>
                      <span>{plan.starsPrice}</span>
                      <span className="text-[10px] text-amber-400 font-bold">Stars</span>
                    </div>
                    <div className="text-[10px] font-sans text-slate-400">{plan.uzsPrice}</div>
                  </div>
                </div>

                {/* Specs High-Density Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-2.5 rounded-xl bg-black/40 border border-slate-800 text-[11px] font-sans">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 text-slate-400" /> Calls
                    </span>
                    <span className="font-bold text-slate-200">{plan.unlimitedCalls ? 'Unlimited' : `${plan.callLimit} calls`}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-slate-400" /> Max Time
                    </span>
                    <span className="font-bold text-slate-200">{plan.maxDurationMinutes} min</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                      <Mic className="w-2.5 h-2.5 text-slate-400" /> Cloud Rec
                    </span>
                    <span className="font-bold text-slate-200">{plan.recordingsLimit} recs</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                      <HardDrive className="w-2.5 h-2.5 text-slate-400" /> Retention
                    </span>
                    <span className="font-bold text-slate-200">{plan.retentionDays} days</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3 text-[11px] text-slate-300 font-sans">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${plan.accentColor}`} />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Action CTA */}
                <button
                  type="button"
                  disabled={isCurrent || loading}
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full py-2.5 px-4 rounded-xl font-sans text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : plan.id === 'BOSS'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25'
                      : plan.id === 'PRO'
                      ? 'bg-mint-600 hover:bg-mint-500 text-slate-950 shadow-lg shadow-mint-600/25'
                      : 'bg-mint-600 hover:bg-mint-500 text-slate-950 shadow-lg shadow-mint-600/25'
                  }`}
                >
                  <span>{isCurrent ? 'ACTIVE PLAN' : `UPGRADE TO ${plan.id} (⭐ ${plan.starsPrice})`}</span>
                  {!isCurrent && <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer Meta */}
        <div className="flex-wrap gap-2 mt-5 pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] font-sans text-slate-600">
          <span>VALIDITY: SHOWN PER PLAN</span>
          <span>PAYMENT: TELEGRAM STARS (⭐) / UZS</span>
        </div>
      </div>
    </div>
  );
};
