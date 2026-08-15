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
  BOSS: PlanTierConfig;
}

export const PLAN_WEIGHTS: Record<string, number> = {
  FREE: 0,
  PLUS: 1,
  PRO: 2,
  BOSS: 3,
};

export function isDowngrade(currentPlan: string, targetPlan: string): boolean {
  const currentKey = (currentPlan || 'FREE').toUpperCase();
  const targetKey = (targetPlan || 'FREE').toUpperCase();
  const currentWeight = PLAN_WEIGHTS[currentKey] ?? 0;
  const targetWeight = PLAN_WEIGHTS[targetKey] ?? 0;
  return targetWeight < currentWeight;
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
    description: '3 practice calls/day, 15 min max duration, 1-day audio recording retention. Ideal for casual learners starting IELTS speaking preparation.',
    maxDuration: 15,
    dailyLimit: 3,
    retentionDays: 1,
    starsPrice: 0,
    uzsPrice: 0,
    active: true,
  },
  PLUS: {
    name: 'Speaking Plus',
    description: '10 practice calls/day, 30 min max duration, 7-day audio recording retention. High-frequency practice with extended speaking topics.',
    maxDuration: 30,
    dailyLimit: 10,
    retentionDays: 7,
    starsPrice: 150,
    uzsPrice: 25000,
    active: true,
  },
  PRO: {
    name: 'Master Pro',
    description: 'Unlimited practice calls/day, 60 min full-exam simulations, 30-day audio recording retention. Perfect for serious test takers targeting Band 7.5+.',
    maxDuration: 60,
    dailyLimit: 999,
    retentionDays: 30,
    starsPrice: 500,
    uzsPrice: 75000,
    active: true,
  },
  BOSS: {
    name: 'Executive Boss',
    description: 'Unlimited practice calls/day, 60 min full-exam simulations, 60-day extended audio retention, VIP priority matchmaking. Ultimate IELTS mastery.',
    maxDuration: 60,
    dailyLimit: 999,
    retentionDays: 60,
    starsPrice: 1000,
    uzsPrice: 150000,
    active: true,
  },
};

export function getPlansConfig(): SystemPlansConfig {
  return plansConfig;
}

export function updatePlansConfig(newConfig: Partial<SystemPlansConfig>): SystemPlansConfig {
  plansConfig = {
    FREE: { ...plansConfig.FREE, ...(newConfig.FREE || {}) },
    PLUS: { ...plansConfig.PLUS, ...(newConfig.PLUS || {}) },
    PRO: { ...plansConfig.PRO, ...(newConfig.PRO || {}) },
    BOSS: { ...plansConfig.BOSS, ...(newConfig.BOSS || {}) },
  };
  return plansConfig;
}

export function formatPriceDisplay(tier: 'PLUS' | 'PRO' | 'BOSS'): string {
  const config = plansConfig[tier] || plansConfig.PLUS;
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
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  dailyLimit?: number | null;
  maxDuration?: number | null;
  retentionOverride?: number | null;
  customPlanName?: string | null;
  telegramId?: bigint | string | number | null;
}): EffectiveEntitlement {
  const telegramIdStr = user.telegramId !== undefined && user.telegramId !== null ? String(user.telegramId) : '';
  const isAdmin = Boolean(env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr));

  let rawPlanKey = (user.plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig
    ? (user.plan!.toUpperCase() as keyof SystemPlansConfig)
    : 'FREE';

  // Check if paid subscription is expired
  if (rawPlanKey !== 'FREE' && !isAdmin) {
    const isExpiredStatus = user.subscriptionStatus === 'EXPIRED' || user.subscriptionStatus === 'CANCELLED';
    const isPastDate = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) < new Date() : false;
    if (isExpiredStatus || isPastDate) {
      rawPlanKey = 'FREE';
    }
  }

  const planKey = rawPlanKey;
  const defaultTier = plansConfig[planKey] ?? plansConfig.FREE;

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

  const isUnlimited = dailyLimit >= 999 || planKey === 'PRO' || planKey === 'BOSS' || isAdmin;
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

export interface PaidUserProfile {
  plan: string;
  planDisplayName: string;
  expiration: string | null;
  callsRemainingToday: string;
  maxCallDuration: number;
  recordingRetention: number;
  isActivePaid: boolean;
  rank: number;
}

export function getPaidUserProfile(user: {
  plan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  dailyLimit?: number | null;
  dailyCallsUsed?: number | null;
  maxDuration?: number | null;
  retentionOverride?: number | null;
  customPlanName?: string | null;
  telegramId?: bigint | string | number | null;
}): PaidUserProfile {
  const entitlement = getEffectiveEntitlement(user);
  const now = new Date();
  const expiresAt = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) : null;
  const isUnexpired = Boolean(expiresAt && expiresAt > now);
  const isActivePaid = (user.plan !== 'FREE' && (user.subscriptionStatus === 'ACTIVE' || isUnexpired)) || false;

  let expirationFormatted: string | null = null;
  if (expiresAt) {
    const year = expiresAt.getUTCFullYear();
    const month = String(expiresAt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(expiresAt.getUTCDate()).padStart(2, '0');
    const hours = String(expiresAt.getUTCHours()).padStart(2, '0');
    const minutes = String(expiresAt.getUTCMinutes()).padStart(2, '0');
    expirationFormatted = `${year}-${month}-${day} ${hours}:${minutes} UTC`;
  }

  const callsUsed = user.dailyCallsUsed || 0;
  const callsRemaining = entitlement.isUnlimited
    ? 'Unlimited'
    : `${Math.max(0, entitlement.dailyLimit - callsUsed)} / ${entitlement.dailyLimit}`;

  return {
    plan: entitlement.plan,
    planDisplayName: entitlement.planDisplayName,
    expiration: expirationFormatted,
    callsRemainingToday: callsRemaining,
    maxCallDuration: entitlement.maxDurationMinutes,
    recordingRetention: entitlement.retentionDays,
    isActivePaid,
    rank: PLAN_WEIGHTS[entitlement.plan] ?? 0,
  };
}

let orderSequence = 20;

export async function generateOrderNumber(prefix: string = 'A'): Promise<string> {
  try {
    const totalManual = await prisma.manualPaymentRequest.count();
    const totalStars = await prisma.starsTransaction.count();
    orderSequence = Math.max(orderSequence + 1, totalManual + totalStars + 21);
  } catch {
    orderSequence += 1;
  }
  return `${prefix}${orderSequence}`;
}

/**
 * Calculates authoritative call duration limit in minutes between two participants:
 * If either participant has an explicit ADMIN_OVERRIDE (e.g. test limits or custom 5-min cap),
 * the restrictive minimum is enforced. Otherwise, the generous mixed plan maximum is granted.
 */
export function calculateEffectiveCallDuration(userA: any, userB: any): number {
  const entA = getEffectiveEntitlement(userA);
  const entB = getEffectiveEntitlement(userB);
  if (entA.source === 'ADMIN_OVERRIDE' || entB.source === 'ADMIN_OVERRIDE') {
    return Math.min(entA.maxDurationMinutes, entB.maxDurationMinutes);
  }
  return Math.max(entA.maxDurationMinutes, entB.maxDurationMinutes);
}

/**
 * Backward compatibility helper for plan strings: returns max(limitA, limitB)
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
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (user) {
    const isExpired = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) < new Date() : false;
    if (user.subscriptionStatus === 'ACTIVE' && !isExpired && user.plan !== 'FREE') {
      return {
        success: false,
        error: createCanonicalError(
          'ACTIVE_SUBSCRIPTION_EXISTS',
          `You have an active paid plan — ${user.plan}. Therefore, you cannot request or buy another plan. Wait until this one expires.`
        ),
      };
    }
  }

  const existingPending = await prisma.manualPaymentRequest.findFirst({
    where: {
      userId: params.userId,
      status: 'PENDING',
    },
  });

  if (existingPending) {
    return {
      success: false,
      error: createCanonicalError('PAYMENT_ALREADY_PENDING', 'You already have a pending subscription request. Please wait for admin approval.'),
      request: existingPending,
    };
  }

  const orderNumber = await generateOrderNumber('A');

  const req = await prisma.manualPaymentRequest.create({
    data: {
      orderNumber,
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

  // Downgrade protection: Prevent an active PRO/BOSS user from being downgraded to PLUS
  if (req.user && isDowngrade(req.user.plan, tier)) {
    const isExpired = req.user.subscriptionExpiresAt ? req.user.subscriptionExpiresAt < new Date() : false;
    if (!isExpired && req.user.subscriptionStatus === 'ACTIVE') {
      throw new Error(`Cannot downgrade user with active ${req.user.plan} subscription to ${tier}.`);
    }
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day subscription term

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
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: expiresAt,
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
        afterState: JSON.stringify({ plan: tier, subscriptionStatus: 'ACTIVE' }),
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
        subscriptionStatus: 'REFUNDED',
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
        afterState: JSON.stringify({ plan: 'FREE', subscriptionStatus: 'REFUNDED' }),
        reason: params.reason || 'Stars payment refunded',
      },
    }),
  ]);

  return { transaction: updatedTx, user: updatedUser };
}
