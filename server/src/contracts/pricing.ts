// Public contract shared by the server, landing, client and admin builds.
// Keep this module free of server configuration, credentials and framework imports.
export const planIds = ['FREE', 'PLUS', 'PRO', 'BOSS'] as const;
export type PlanId = typeof planIds[number];
export type PricingCurrency = 'XTR' | 'UZS';
export interface PlanSource {
  name: string; description: string; maxDuration: number; dailyLimit: number; callsLimit: number;
  recordingLimit: number; retentionDays: number; starsPrice: number; uzsPrice: number;
  subscriptionDurationDays: number; active: boolean;
}
export interface PublicPlan {
  id: PlanId; name: string; description: string; calls: number; unlimitedCalls: boolean;
  maxCallMinutes: number; recordings: number; retentionDays: number; validityDays: number;
  period: 'calendar_month' | 'subscription'; prices: { XTR: number; UZS: number };
}
export interface PublicPricing {
  version: 1; revision: string; checkedAt: string; botUsername: string; plans: PublicPlan[];
}
export function publicPlan(id: PlanId, source: PlanSource): PublicPlan {
  return { id, name: source.name, description: source.description, calls: source.dailyLimit,
    unlimitedCalls: source.dailyLimit >= 999, maxCallMinutes: source.maxDuration,
    recordings: source.recordingLimit, retentionDays: source.retentionDays,
    validityDays: id === 'FREE' ? 0 : source.subscriptionDurationDays,
    period: id === 'FREE' ? 'calendar_month' : 'subscription', prices: { XTR: source.starsPrice, UZS: source.uzsPrice } };
}
export function isPublicPricing(value: unknown): value is PublicPricing {
  if (!value || typeof value !== 'object') return false;
  const data = value as PublicPricing;
  if (data.version !== 1 || typeof data.revision !== 'string' || !/^[a-f0-9]{64}$/.test(data.revision) || typeof data.checkedAt !== 'string' || !Number.isFinite(Date.parse(data.checkedAt)) || typeof data.botUsername !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(data.botUsername) || !Array.isArray(data.plans) || data.plans.length > 4) return false;
  const seen = new Set<string>();
  return data.plans.every(plan => {
    if (!plan || !planIds.includes(plan.id) || seen.has(plan.id)) return false;
    seen.add(plan.id);
    return typeof plan.name === 'string' && plan.name.length > 0 && plan.name.length <= 80 && typeof plan.description === 'string' && plan.description.length <= 1000
      && [plan.calls, plan.recordings, plan.prices?.XTR, plan.prices?.UZS].every(n => Number.isInteger(n) && n >= 0 && n <= 2147483647)
      && Number.isInteger(plan.maxCallMinutes) && plan.maxCallMinutes >= 1 && plan.maxCallMinutes <= 1440
      && Number.isInteger(plan.retentionDays) && plan.retentionDays >= 1 && plan.retentionDays <= 3650
      && Number.isInteger(plan.validityDays) && plan.validityDays >= 0 && plan.validityDays <= 3650
      && plan.unlimitedCalls === (plan.calls >= 999)
      && (plan.id === 'FREE' ? plan.period === 'calendar_month' && plan.validityDays === 0 : plan.period === 'subscription' && plan.validityDays > 0);
  });
}
export function planPeriod(plan: PublicPlan): string { return plan.period === 'calendar_month' ? 'calendar month' : `${plan.validityDays}-day period`; }
export function formatPlanPrice(plan: PublicPlan, currency: PricingCurrency): string {
  return `${plan.prices[currency].toLocaleString('en-US')} ${currency === 'XTR' ? 'Stars' : 'UZS'}`;
}
export function pricePerIncludedCall(plan: PublicPlan, currency: PricingCurrency): number | null {
  return plan.unlimitedCalls || plan.calls === 0 ? null : plan.prices[currency] / plan.calls;
}
export interface PracticeNeeds { calls: number; minutes: number; recordings: number; retentionDays: number }
export function matchesNeeds(plan: PublicPlan, needs: PracticeNeeds): boolean {
  return (plan.unlimitedCalls || plan.calls >= needs.calls) && plan.maxCallMinutes >= needs.minutes && plan.recordings >= needs.recordings && (needs.recordings === 0 || plan.retentionDays >= needs.retentionDays);
}
export function recommendPlan(plans: PublicPlan[], needs: PracticeNeeds, currency: PricingCurrency): PublicPlan | undefined {
  return plans.filter(plan => matchesNeeds(plan, needs)).sort((a, b) => a.prices[currency] - b.prices[currency] || planIds.indexOf(a.id) - planIds.indexOf(b.id))[0];
}
export function planCheckoutUrl(username: string, plan: PublicPlan): string {
  return `https://t.me/${username}?start=${plan.id === 'FREE' ? 'register' : `upgrade_${plan.id.toLowerCase()}`}`;
}
