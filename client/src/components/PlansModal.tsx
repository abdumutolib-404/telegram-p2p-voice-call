import React from 'react';
import { X, ShieldAlert, Sparkles, Clock, Phone, Mic, HardDrive, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { PAID_PLANS } from '../constants/plans';

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
  if (!isOpen) return null;

  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'PairTalkBot').replace(/^@/, '');

  const handleSelectPlan = (planId: string) => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.HapticFeedback?.impactOccurred?.('medium');
      const upgradeUrl = `https://t.me/${botUsername}?start=upgrade_${planId.toLowerCase()}`;
      if (typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(upgradeUrl);
      } else {
        window.open(upgradeUrl, '_blank');
      }
    } else {
      window.open(`https://t.me/${botUsername}`, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto motion-reduce:backdrop-blur-none animate-fadeIn">
      <div className="relative w-full max-w-lg my-8 p-5 md:p-6 bg-[#090D18] border border-slate-800 rounded-3xl shadow-2xl text-slate-100 font-sans">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Close plans modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6 pr-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono font-bold tracking-widest uppercase border border-purple-500/40 text-purple-400 bg-purple-950/40 mb-2">
            <Sparkles className="w-3 h-3" />
            <span>UPGRADE PRACTICE CAPACITY</span>
          </div>
          <h2 className="text-xl md:text-2xl font-mono font-black tracking-tight text-white uppercase">
            CHOOSE YOUR PLAN
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-mono">
            Unlock extended speaking time, priority matchmaking, and audio recordings with Telegram Stars or Card.
          </p>
        </div>

        {/* Server Refund Policy Notice Banner */}
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-amber-300 text-xs leading-relaxed flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1 text-[11px]">
            <p className="font-mono font-bold tracking-wider uppercase text-amber-400">
              Server-Enforced Refund Policy Notice
            </p>
            <p className="text-slate-300 font-mono text-[10.5px]">
              Refunds are automatically evaluated server-side. A purchase is eligible for a full refund <strong className="text-amber-200">ONLY</strong> if:{' '}
              <span className="text-amber-300 font-semibold">(1) Less than 10% of purchased call credits have been utilized</span>, OR{' '}
              <span className="text-amber-300 font-semibold">(2) Less than 2 days (48h) have elapsed since purchase</span>.
            </p>
          </div>
        </div>

        {/* Tax & Currency Difference Warning Banner */}
        <div className="mb-5 p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 text-slate-300 text-xs leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
          <p className="font-mono text-[10.5px] text-slate-400">
            <strong className="text-cyan-300 uppercase">Tax & Currency Notice:</strong> Prices in UZS (Card) and Stars (Telegram Stars) may slightly differ due to local VAT, currency conversions, and app store taxes.
          </p>
        </div>

        {/* Purchasable Plans Cards Grid (FREE excluded) */}
        <div className="space-y-4">
          {PAID_PLANS.map((plan) => {
            const isCurrent = currentPlan.toUpperCase() === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative p-4 rounded-2xl border transition-all bg-gradient-to-b ${plan.bgGlow} ${plan.borderColor} ${
                  isCurrent ? 'ring-2 ring-cyan-500 shadow-lg shadow-cyan-500/20' : ''
                }`}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`text-base font-mono font-black tracking-wide uppercase ${plan.accentColor}`}>
                        {plan.name}
                      </h3>
                      <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-black/50 border border-slate-700 text-slate-300">
                        {plan.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{plan.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-mono font-black text-white flex items-center justify-end gap-1">
                      <span>⭐</span>
                      <span>{plan.starsPrice}</span>
                      <span className="text-[10px] text-amber-400 font-bold">Stars</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{plan.uzsPrice}</div>
                  </div>
                </div>

                {/* Specs High-Density Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 p-2.5 rounded-xl bg-black/40 border border-slate-800 text-[11px] font-mono">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 text-slate-400" /> Calls
                    </span>
                    <span className="font-bold text-slate-200">{plan.callLimit} calls</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3 text-[11px] text-slate-300 font-mono">
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
                  disabled={isCurrent}
                  onClick={() => handleSelectPlan(plan.id)}
                  className={`w-full py-2.5 px-4 rounded-xl font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      : plan.id === 'BOSS'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/25'
                      : plan.id === 'PRO'
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-600/25'
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
        <div className="mt-5 pt-3 border-t border-slate-900 flex items-center justify-between text-[10px] font-mono text-slate-600">
          <span>VALIDITY: 30 DAYS FROM PURCHASE</span>
          <span>PAYMENT: TELEGRAM STARS (⭐) / UZS</span>
        </div>
      </div>
    </div>
  );
};
