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
    dailyLimit: 9999,
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

/**
 * Calculates mixed-plan call duration limit in minutes: max(limit_A, limit_B)
 */
export function calculateMixedPlanDuration(planA: string, planB: string): number {
  const tierA = (planA.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? planA.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  const tierB = (planB.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? planB.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  
  const limitA = plansConfig[tierA].maxDuration;
  const limitB = plansConfig[tierB].maxDuration;
  
  return Math.max(limitA, limitB);
}

export function getRetentionDaysForPlan(plan: string): number {
  const tier = (plan.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? plan.toUpperCase() as keyof SystemPlansConfig : 'FREE';
  return plansConfig[tier].retentionDays;
}
