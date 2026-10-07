import type { PaidPlanInfo } from '../types';
import { planPeriod, type PublicPlan } from '../../../server/src/contracts/pricing';

export function toPaidPlanInfo(plan: PublicPlan): PaidPlanInfo {
  if (plan.id === 'FREE') throw new Error('Free is not a paid purchase.');
  return { id: plan.id, name: plan.name, badge: `${plan.validityDays} DAYS`,
    starsPrice: plan.prices.XTR, uzsPrice: `${plan.prices.UZS.toLocaleString('en-US')} UZS`, validityDays: plan.validityDays,
    callLimit: plan.calls, unlimitedCalls: plan.unlimitedCalls, maxDurationMinutes: plan.maxCallMinutes, recordingsLimit: plan.recordings, retentionDays: plan.retentionDays,
    accentColor: plan.id === 'BOSS' ? 'text-amber-400' : 'text-mint-400',
    borderColor: 'border-mint-500/40 hover:border-mint-400', bgGlow: 'from-mint-950/40 via-slate-900/80 to-slate-900', description: `A ${plan.validityDays}-day routine with the allowances below.`,
    features: [`${plan.unlimitedCalls ? 'Unlimited' : plan.calls} calls per ${planPeriod(plan)}`, `Up to ${plan.maxCallMinutes} minutes per call`, `${plan.recordings} recordings per period`, `${plan.retentionDays} days of recording retention`],
  };
}
