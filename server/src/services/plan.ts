import { env } from '../config/env';
import { prisma } from '../config/database';
import { createCanonicalError } from '../types/canonical';

export interface PlanTierConfig {
  name: string;
  description: string;
  maxDuration: number; // in minutes
  dailyLimit: number; // max calls per day
  retentionDays: number; // recording retention in days
  starsPrice: number; // price in Telegram Stars (XTR)
  uzsPrice: number; // price in UZS (Uzbek Som)
  active: boolean;
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
    name: 'Free Starter',
    description: 'Daily practice for IELTS speaking',
    maxDuration: 15,
    dailyLimit: 3,
    retentionDays: 1,
    starsPrice: 0,
    uzsPrice: 0,
    active: true,
  },
  PLUS: {
    name: 'Speaking Plus',
    description: '30-min calls, 10 daily sessions, 7-day retention',
    maxDuration: 30,
    dailyLimit: 10,
    retentionDays: 7,
    starsPrice: 150,
    uzsPrice: 25000,
    active: true,
  },
  PRO: {
    name: 'Master Pro',
    description: '60-min calls, unlimited practice, 30-day retention',
    maxDuration: 60,
    dailyLimit: 999,
    retentionDays: 30,
    starsPrice: 500,
    uzsPrice: 75000,
    active: true,
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

export function formatPriceDisplay(tier: 'PLUS' | 'PRO'): string {
  const config = plansConfig[tier];
  const formattedUzs = config.uzsPrice.toLocaleString('en-US');
  return `⭐ ${config.starsPrice} Stars / 💳 ${formattedUzs} UZS`;
}

export function getDailyLimitForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? (plan.toUpperCase() as keyof SystemPlansConfig) : 'FREE';
  return plansConfig[tier]?.dailyLimit ?? 3;
}

export function getMaxDurationForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? (plan.toUpperCase() as keyof SystemPlansConfig) : 'FREE';
  return plansConfig[tier]?.maxDuration ?? 15;
}

export function getRetentionDaysForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? (plan.toUpperCase() as keyof SystemPlansConfig) : 'FREE';
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

/**
 * Manual Payment Workflows
 */
export async function createManualPaymentRequest(params: {
  userId: string;
  telegramId: bigint | number | string;
  alias: string;
  plan: string;
  uzsAmount: number;
  paymentProof?: string;
}) {
  const existingPending = await prisma.manualPaymentRequest.findFirst({
    where: {
      userId: params.userId,
      status: 'PENDING',
    },
  });

  if (existingPending) {
    return {
      success: false,
      error: createCanonicalError('PAYMENT_ALREADY_PENDING', 'You already have a manual payment request pending review.'),
      request: existingPending,
    };
  }

  const req = await prisma.manualPaymentRequest.create({
    data: {
      userId: params.userId,
      telegramId: BigInt(String(params.telegramId)),
      alias: params.alias,
      plan: params.plan.toUpperCase(),
      uzsAmount: params.uzsAmount,
      paymentProof: params.paymentProof || null,
      status: 'PENDING',
    },
  });

  return { success: true, request: req };
}

export async function approveManualPaymentRequest(params: {
  requestId: string;
  adminId: string;
  note?: string;
}) {
  const req = await prisma.manualPaymentRequest.findUnique({
    where: { id: params.requestId },
    include: { user: true },
  });

  if (!req || req.status !== 'PENDING') {
    throw new Error('Payment request not found or already processed.');
  }

  const tier = (req.plan.toUpperCase() as keyof SystemPlansConfig) in plansConfig
    ? (req.plan.toUpperCase() as keyof SystemPlansConfig)
    : 'PLUS';
  const config = plansConfig[tier] || plansConfig.PLUS;

  const [updatedReq, updatedUser] = await prisma.$transaction([
    prisma.manualPaymentRequest.update({
      where: { id: req.id },
      data: {
        status: 'APPROVED',
        adminNote: params.note || 'Payment verified and approved by admin',
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: req.userId },
      data: {
        plan: tier,
        maxDuration: config.maxDuration,
        dailyLimit: config.dailyLimit,
        dailyCallsUsed: 0,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_APPROVAL',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ plan: req.user?.plan || 'FREE' }),
        afterState: JSON.stringify({ plan: tier }),
        reason: params.note || 'Manual payment approved',
      },
    }),
  ]);

  return { request: updatedReq, user: updatedUser };
}

export async function rejectManualPaymentRequest(params: {
  requestId: string;
  adminId: string;
  note?: string;
}) {
  const req = await prisma.manualPaymentRequest.findUnique({
    where: { id: params.requestId },
  });

  if (!req || req.status !== 'PENDING') {
    throw new Error('Payment request not found or already processed.');
  }

  const [updatedReq] = await prisma.$transaction([
    prisma.manualPaymentRequest.update({
      where: { id: req.id },
      data: {
        status: 'REJECTED',
        adminNote: params.note || 'Payment rejected by admin',
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_REJECTION',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ status: req.status }),
        afterState: JSON.stringify({ status: 'REJECTED' }),
        reason: params.note || 'Payment rejected',
      },
    }),
  ]);

  return { request: updatedReq };
}

export async function revokePlanOnRefund(params: {
  transactionId: string;
  adminId: string;
  reason?: string;
}) {
  const tx = await prisma.starsTransaction.findUnique({
    where: { id: params.transactionId },
    include: { user: true },
  });

  if (!tx || tx.status === 'REFUNDED') {
    throw new Error('Transaction not found or already refunded.');
  }

  const [updatedTx, updatedUser] = await prisma.$transaction([
    prisma.starsTransaction.update({
      where: { id: tx.id },
      data: {
        status: 'REFUNDED',
        refundReason: params.reason || 'Telegram Stars payment refunded',
        refundedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: tx.userId },
      data: {
        plan: 'FREE',
        maxDuration: plansConfig.FREE.maxDuration,
        dailyLimit: plansConfig.FREE.dailyLimit,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: 'STARS_REFUND_REVOKE',
        targetId: tx.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ plan: tx.user?.plan || 'PRO' }),
        afterState: JSON.stringify({ plan: 'FREE' }),
        reason: params.reason || 'Stars payment refunded',
      },
    }),
  ]);

  return { transaction: updatedTx, user: updatedUser };
}
