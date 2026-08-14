import { env } from '../config/env';

export interface PlanTierConfig {
  maxDuration: number; // in minutes
  dailyLimit: number; // max calls per day
  retentionDays: number; // recording retention in days
  starsPrice: number; // price in Telegram Stars
}

export interface SystemPlansConfig {
  FREE: PlanTierConfig;
  PLUS: PlanTierConfig;
  PRO: PlanTierConfig;
}

export interface EffectiveEntitlement {
  plan: string;
  planDisplayName: string;
  dailyLimit: number;
  maxDurationMinutes: number;
  retentionDays: number;
  isUnlimited: boolean;
  isAdmin: boolean;
  source: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' | 'CUSTOM_PLAN';
  retentionSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE';
}

let plansConfig: SystemPlansConfig = {
  FREE: {
    maxDuration: 15,
    dailyLimit: 3,
    retentionDays: 1,
    starsPrice: 0,
  },
  PLUS: {
    maxDuration: 30,
    dailyLimit: 10,
    retentionDays: 7,
    starsPrice: 150,
  },
  PRO: {
    maxDuration: 60,
    dailyLimit: 999,
    retentionDays: 30,
    starsPrice: 500,
  },
};

export function getPlansConfig(): SystemPlansConfig {
  return plansConfig;
}

export function updatePlansConfig(newConfig: Partial<SystemPlansConfig>): SystemPlansConfig {
  plansConfig = {
    FREE: { ...plansConfig.FREE, ...newConfig.FREE },
    PLUS: { ...plansConfig.PLUS, ...newConfig.PLUS },
    PRO: { ...plansConfig.PRO, ...newConfig.PRO },
  };
  return plansConfig;
}

export function getDailyLimitForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? plan.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  return plansConfig[tier]?.dailyLimit ?? 3;
}

export function getMaxDurationForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? plan.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  return plansConfig[tier]?.maxDuration ?? 15;
}

export function getRetentionDaysForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? plan.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  return plansConfig[tier]?.retentionDays ?? 1;
}

export function getEffectiveEntitlement(user: {
  plan?: string | null;
  dailyLimit?: number | null;
  maxDuration?: number | null;
  retentionOverride?: number | null;
  customPlanName?: string | null;
  telegramId?: bigint | string | number | null;
}): EffectiveEntitlement {
  const planKey = (user.plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig
    ? (user.plan!.toUpperCase() as keyof SystemPlansConfig)
    : 'FREE';

  const defaultTier = plansConfig[planKey] ?? plansConfig.FREE;
  const telegramIdStr = user.telegramId !== undefined && user.telegramId !== null ? String(user.telegramId) : '';
  const isAdmin = Boolean(env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr));

  // Determine Daily Limit
  let dailyLimit = defaultTier.dailyLimit;
  let isCustomLimit = false;
  if (user.dailyLimit !== undefined && user.dailyLimit !== null && user.dailyLimit !== defaultTier.dailyLimit) {
    dailyLimit = user.dailyLimit;
    isCustomLimit = true;
  }
  if (isAdmin) {
    dailyLimit = 999;
  }

  // Determine Max Duration
  let maxDurationMinutes = defaultTier.maxDuration;
  let isCustomDuration = false;
  if (user.maxDuration !== undefined && user.maxDuration !== null && user.maxDuration !== defaultTier.maxDuration) {
    maxDurationMinutes = user.maxDuration;
    isCustomDuration = true;
  }

  // Determine Retention Days
  let retentionDays = defaultTier.retentionDays;
  let retentionSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' = 'PLAN_DEFAULT';
  if (user.retentionOverride !== undefined && user.retentionOverride !== null && user.retentionOverride > 0) {
    retentionDays = user.retentionOverride;
    retentionSource = 'ADMIN_OVERRIDE';
  }

  const isUnlimited = dailyLimit >= 999 || planKey === 'PRO' || isAdmin;
  const isCustomPlan = Boolean(user.customPlanName);
  const source: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' | 'CUSTOM_PLAN' = isCustomPlan
    ? 'CUSTOM_PLAN'
    : (isCustomLimit || isCustomDuration || retentionSource === 'ADMIN_OVERRIDE')
    ? 'ADMIN_OVERRIDE'
    : 'PLAN_DEFAULT';

  return {
    plan: planKey,
    planDisplayName: user.customPlanName || planKey,
    dailyLimit,
    maxDurationMinutes,
    retentionDays,
    isUnlimited,
    isAdmin,
    source,
    retentionSource,
  };
}

/**
 * Calculates mixed-plan call duration limit in minutes: max(limit_A, limit_B)
 */
export function calculateMixedPlanDuration(planA: string, planB: string): number {
  const limitA = getMaxDurationForPlan(planA);
  const limitB = getMaxDurationForPlan(planB);
  return Math.max(limitA, limitB);
}
