import { z } from 'zod';
import type { PlanTierConfig } from '../services/plan';

export const discountCampaignInput = z.object({
  requestId: z.string().uuid(),
  plan: z.enum(['PLUS', 'PRO', 'BOSS']),
  percent: z.number().min(0.01).max(100).multipleOf(0.01),
  recipientCount: z.number().int().min(1).max(10000),
  validMinutes: z.number().int().min(1).max(525600),
}).strict();
export type DiscountCampaignInput = z.infer<typeof discountCampaignInput>;

// Both currencies use whole units. Round up once, after applying the discount.
export { discountedPrice } from './discountPricing';

export function discountPlan(snapshot: string): PlanTierConfig {
  const plan = JSON.parse(snapshot) as PlanTierConfig;
  for (const key of ['maxDuration', 'dailyLimit', 'recordingLimit', 'retentionDays', 'subscriptionDurationDays'] as const) {
    if (!Number.isSafeInteger(plan[key]) || plan[key] < 0) throw new Error('Offer configuration is unavailable.');
  }
  if (!plan.subscriptionDurationDays || !plan.maxDuration || !plan.retentionDays || typeof plan.name !== 'string') throw new Error('Offer configuration is unavailable.');
  return plan;
}
