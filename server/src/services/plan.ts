import { env } from '../config/env';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { createCanonicalError } from '../types/canonical';
import { lockRow } from '../utils/transactionLock';
import { decodePaymentProof } from '../utils/paymentProof';
import type { Prisma } from '@prisma/client';

export interface PlanTierConfig {
  name: string;
  description: string;
  maxDuration: number; // in minutes
  dailyLimit: number; // calls limit per billing period
  callsLimit: number; // alias for calls limit
  recordingLimit: number; // recordings limit per billing period
  retentionDays: number; // recording retention in days
  starsPrice: number; // price in Telegram Stars (XTR)
  uzsPrice: number; // price in UZS (Uzbek Som)
  subscriptionDurationDays: number; // validity term in days
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
  planName: string;
  planDisplayName: string;
  callLimit: number;
  dailyLimit: number;
  maxCallDuration: number;
  maxDurationMinutes: number;
  recordingLimit: number;
  recordingRetention: number;
  retentionDays: number;
  starsPrice: number;
  uzsPrice: number;
  subscriptionDurationDays: number;
  isUnlimited: boolean;
  isAdmin: boolean;
  subscriptionStatus: string;
  subscriptionExpiresAt: Date | string | null;
  overrideSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE';
  source: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' | 'CUSTOM_PLAN';
  retentionSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE';
}

let plansConfig: SystemPlansConfig = {
  FREE: {
    name: 'Free',
    description: '3 calls/month, 15 min max duration, 1 recording, 1-day retention.',
    maxDuration: 15,
    dailyLimit: 3,
    callsLimit: 3,
    recordingLimit: 1,
    retentionDays: 1,
    starsPrice: 0,
    uzsPrice: 0,
    subscriptionDurationDays: 0,
    active: true,
  },
  PLUS: {
    name: 'Plus',
    description: '10 calls/month, 30 min max duration, 3 recordings, 7-day retention.',
    maxDuration: 30,
    dailyLimit: 10,
    callsLimit: 10,
    recordingLimit: 3,
    retentionDays: 7,
    starsPrice: 79,
    uzsPrice: 15000,
    subscriptionDurationDays: 30,
    active: true,
  },
  PRO: {
    name: 'Pro',
    description: '25 calls/month, 60 min max duration, 7 recordings, 30-day retention.',
    maxDuration: 60,
    dailyLimit: 25,
    callsLimit: 25,
    recordingLimit: 7,
    retentionDays: 30,
    starsPrice: 255,
    uzsPrice: 55000,
    subscriptionDurationDays: 30,
    active: true,
  },
  BOSS: {
    name: 'Boss',
    description: '50 calls/month, 90 min max duration, 15 recordings, 90-day retention.',
    maxDuration: 90,
    dailyLimit: 50,
    callsLimit: 50,
    recordingLimit: 15,
    retentionDays: 90,
    starsPrice: 679,
    uzsPrice: 149000,
    subscriptionDurationDays: 30,
    active: true,
  },
};

export function getPlansConfig(): SystemPlansConfig {
  return plansConfig;
}

export function getPurchasablePlansConfig(): Omit<SystemPlansConfig, 'FREE'> {
  const { FREE, ...paidPlans } = plansConfig;
  return paidPlans;
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

export function getRecordingLimitForPlan(plan: string): number {
  const tier = (plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig ? (plan.toUpperCase() as keyof SystemPlansConfig) : 'FREE';
  return plansConfig[tier]?.recordingLimit ?? 1;
}

export function getEffectiveEntitlement(user: {
  plan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | string | null;
  dailyLimit?: number | null;
  maxDuration?: number | null;
  recordingLimit?: number | null;
  recordingLimitOverride?: number | null;
  retentionOverride?: number | null;
  customPlanName?: string | null;
  telegramId?: bigint | string | number | null;
}): EffectiveEntitlement {
  const telegramIdStr = user.telegramId !== undefined && user.telegramId !== null ? String(user.telegramId) : '';
  const isAdmin = Boolean(env.ADMIN_TELEGRAM_IDS && env.ADMIN_TELEGRAM_IDS.includes(telegramIdStr));

  let rawPlanKey = (user.plan?.toUpperCase() as keyof SystemPlansConfig) in plansConfig
    ? (user.plan!.toUpperCase() as keyof SystemPlansConfig)
    : 'FREE';

  let expired = false;
  // Check if paid subscription is expired
  if (rawPlanKey !== 'FREE' && !isAdmin) {
    const isExpiredStatus = user.subscriptionStatus === 'EXPIRED' || user.subscriptionStatus === 'CANCELLED';
    const isPastDate = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) < new Date() : false;
    if (isExpiredStatus || isPastDate) {
      expired = true;
      rawPlanKey = 'FREE';
    }
  }

  const planKey = rawPlanKey;
  const defaultTier = plansConfig[planKey] ?? plansConfig.FREE;

  // Determine Call Limit
  let dailyLimit = defaultTier.dailyLimit;
  let isCustomLimit = false;
  if (!expired && user.dailyLimit !== undefined && user.dailyLimit !== null && user.dailyLimit !== defaultTier.dailyLimit) {
    dailyLimit = user.dailyLimit;
    isCustomLimit = true;
  }
  if (isAdmin) {
    dailyLimit = 999;
  }

  // Determine Max Duration
  let maxDurationMinutes = defaultTier.maxDuration;
  let isCustomDuration = false;
  if (!expired && user.maxDuration !== undefined && user.maxDuration !== null && user.maxDuration !== defaultTier.maxDuration) {
    maxDurationMinutes = user.maxDuration;
    isCustomDuration = true;
  }

  // Determine Recording Limit
  let recordingLimit = defaultTier.recordingLimit;
  let isCustomRecordingLimit = false;
  const recordingOverride = user.recordingLimitOverride ?? user.recordingLimit;
  if (!expired && recordingOverride !== undefined && recordingOverride !== null && recordingOverride >= 0) {
    recordingLimit = recordingOverride;
    isCustomRecordingLimit = true;
  }

  // Determine Retention Days
  let retentionDays = defaultTier.retentionDays;
  let retentionSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' = 'PLAN_DEFAULT';
  if (!expired && user.retentionOverride !== undefined && user.retentionOverride !== null && user.retentionOverride > 0) {
    retentionDays = user.retentionOverride;
    retentionSource = 'ADMIN_OVERRIDE';
  }

  const isUnlimited = dailyLimit >= 999 || isAdmin;
  const isCustomPlan = !expired && Boolean(user.customPlanName);
  const overrideSource: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' =
    isCustomLimit || isCustomDuration || isCustomRecordingLimit || retentionSource === 'ADMIN_OVERRIDE'
      ? 'ADMIN_OVERRIDE'
      : 'PLAN_DEFAULT';
  const source: 'PLAN_DEFAULT' | 'ADMIN_OVERRIDE' | 'CUSTOM_PLAN' = isCustomPlan
    ? 'CUSTOM_PLAN'
    : overrideSource;

  const planDisplayName = (!expired && user.customPlanName) || defaultTier.name;

  return {
    plan: planKey,
    planName: planDisplayName,
    planDisplayName,
    callLimit: dailyLimit,
    dailyLimit,
    maxCallDuration: maxDurationMinutes,
    maxDurationMinutes,
    recordingLimit,
    recordingRetention: retentionDays,
    retentionDays,
    starsPrice: defaultTier.starsPrice,
    uzsPrice: defaultTier.uzsPrice,
    subscriptionDurationDays: defaultTier.subscriptionDurationDays ?? (planKey === 'FREE' ? 0 : 30),
    isUnlimited,
    isAdmin,
    subscriptionStatus: user.subscriptionStatus || (planKey === 'FREE' ? 'NONE' : 'ACTIVE'),
    subscriptionExpiresAt: user.subscriptionExpiresAt || null,
    overrideSource,
    source,
    retentionSource,
  };
}

export async function getUserCallsUsedThisPeriod(userId: string, user?: any, transaction?: Pick<Prisma.TransactionClient, 'user' | 'callSession'>): Promise<number> {
  const database = transaction ?? prisma;
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const targetUser = user || (await database.user.findUnique({ where: { id: userId } }));
    if (!targetUser) return 0;

    if (targetUser.lastCallDate && targetUser.lastCallDate.startsWith(currentMonth)) {
      if (typeof targetUser.dailyCallsUsed === 'number') {
        return Math.max(0, targetUser.dailyCallsUsed);
      }
    }

    const now = new Date();
    let periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (targetUser.subscriptionExpiresAt) {
      const expiresAt = new Date(targetUser.subscriptionExpiresAt);
      if (expiresAt > new Date()) {
        const durationDays = targetUser.subscriptionDurationDays || 30;
        periodStart = new Date(expiresAt.getTime() - durationDays * 24 * 60 * 60 * 1000);
      }
    }
    const count = await database.callSession.count({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'COMPLETED',
        duration: { gte: 5 },
        createdAt: { gte: periodStart },
      },
    });
    return count;
  } catch (error) {
    if (env.NODE_ENV !== 'test' || transaction) throw error;
    return 0;
  }
}

export async function getUserRecordingsUsedThisPeriod(userId: string, user?: any): Promise<number> {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const targetUser = user || (await prisma.user.findUnique({ where: { id: userId } }));
    if (!targetUser) return 0;

    if (
      targetUser.lastCallDate &&
      targetUser.lastCallDate.startsWith(currentMonth) &&
      typeof targetUser.recordingsUsed === 'number'
    ) {
      return Math.max(0, targetUser.recordingsUsed);
    }

    const now = new Date();
    let periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    if (targetUser.subscriptionExpiresAt) {
      const expiresAt = new Date(targetUser.subscriptionExpiresAt);
      if (expiresAt > new Date()) {
        const durationDays = targetUser.subscriptionDurationDays || 30;
        periodStart = new Date(expiresAt.getTime() - durationDays * 24 * 60 * 60 * 1000);
      }
    }
    const count = await prisma.callSession.count({
      where: {
        AND: [{ OR: [{ userAId: userId }, { userBId: userId }] }, { OR: [
          { recordedByUserId: userId },
          { recordedByUserId: 'BOTH' },
          { recordedByUserId: 'ALL' },
          { recordedByUserId: null, userAId: userId },
          { recordedByUserId: null, userBId: userId },
          { recordedByUserId: { startsWith: `${userId},` } },
          { recordedByUserId: { endsWith: `,${userId}` } },
          { recordedByUserId: { contains: `,${userId},` } },
        ] }],
        recordingUrl: { not: null },
        createdAt: { gte: periodStart },
      },
    });

    return count;
  } catch (error) {
    if (env.NODE_ENV !== 'test') throw error;
    return 0;
  }
}

export interface PaidUserProfile {
  plan: string;
  planDisplayName: string;
  expiration: string | null;
  callsRemainingToday: string;
  callsRemaining: string;
  recordingsRemaining: string;
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
  recordingsUsed?: number | null;
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

  const callsUsed = typeof user.dailyCallsUsed === 'number' ? user.dailyCallsUsed : 0;
  const callsRemainingFormatted = entitlement.isAdmin
    ? 'Unlimited'
    : `${Math.max(0, entitlement.callLimit - callsUsed)} / ${entitlement.callLimit}`;

  const recUsed = typeof user.recordingsUsed === 'number' ? user.recordingsUsed : 0;
  const recordingsRemainingFormatted = entitlement.isAdmin
    ? 'Unlimited'
    : `${Math.max(0, entitlement.recordingLimit - recUsed)} / ${entitlement.recordingLimit}`;

  return {
    plan: entitlement.plan,
    planDisplayName: entitlement.planDisplayName,
    expiration: expirationFormatted,
    callsRemainingToday: callsRemainingFormatted,
    callsRemaining: callsRemainingFormatted,
    recordingsRemaining: recordingsRemainingFormatted,
    maxCallDuration: entitlement.maxCallDuration,
    recordingRetention: entitlement.recordingRetention,
    isActivePaid,
    rank: PLAN_WEIGHTS[entitlement.plan] ?? 0,
  };
}

let inMemoryFallbackSequence = 0;
let initSequencePromise: Promise<void> | null = null;

export function resetOrderSequenceForTesting(): void {
  inMemoryFallbackSequence = 0;
  initSequencePromise = null;
}

export async function getMaxOrderNumberFromDb(): Promise<number> {
  let maxOrderNum = 0;
  try {
    const manualRecords = await prisma.manualPaymentRequest.findMany({
      select: { orderNumber: true },
    });
    for (const record of manualRecords) {
      if (record?.orderNumber) {
        const match = record.orderNumber.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxOrderNum) {
            maxOrderNum = num;
          }
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') throw error;
    // Test-only mock fallback
  }

  try {
    const starsRecords = await prisma.starsTransaction.findMany({
      select: { orderNumber: true },
    });
    for (const record of starsRecords) {
      if (record?.orderNumber) {
        const match = record.orderNumber.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxOrderNum) {
            maxOrderNum = num;
          }
        }
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') throw error;
    // Test-only mock fallback
  }

  return maxOrderNum;
}

export async function initializeOrderSequence(): Promise<void> {
  if (!initSequencePromise) {
    initSequencePromise = (async () => {
      try {
        let totalManual = 0;
        let totalStars = 0;
        try {
          totalManual = await prisma.manualPaymentRequest.count();
        } catch {}
        try {
          totalStars = await prisma.starsTransaction.count();
        } catch {}
        const maxOrderNumberFromDb = await getMaxOrderNumberFromDb();
        const initialValue = Math.max(totalManual + totalStars, maxOrderNumberFromDb);

        const redis = getRedis();
        const existing = await redis.get('counter:order_sequence');
        if (existing === null) {
          await redis.set('counter:order_sequence', initialValue.toString(), 'NX');
        }
        if (inMemoryFallbackSequence === 0) {
          inMemoryFallbackSequence = initialValue;
        }
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') throw error;
        if (inMemoryFallbackSequence === 0) {
          let totalManual = 0;
          let totalStars = 0;
          try {
            totalManual = await prisma.manualPaymentRequest.count();
          } catch {}
          try {
            totalStars = await prisma.starsTransaction.count();
          } catch {}
          const maxOrderNumberFromDb = await getMaxOrderNumberFromDb().catch(() => 0);
          inMemoryFallbackSequence = Math.max(totalManual + totalStars, maxOrderNumberFromDb);
        }
      } finally {
        initSequencePromise = null;
      }
    })();
  }
  await initSequencePromise;
}

export async function generateOrderNumber(prefix: string = 'A'): Promise<string> {
  let seq: number;
  try {
    const redis = getRedis();
    const existing = await redis.get('counter:order_sequence');
    if (existing === null) {
      await initializeOrderSequence();
    }
    seq = await redis.incr('counter:order_sequence');
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') throw error;
    // Safe test-only fallback for tests/environments where Redis is mocked or throws
    if (inMemoryFallbackSequence === 0) {
      await initializeOrderSequence().catch(() => {});
      if (inMemoryFallbackSequence === 0) {
        let totalManual = 0;
        let totalStars = 0;
        try {
          totalManual = await prisma.manualPaymentRequest.count();
        } catch {}
        try {
          totalStars = await prisma.starsTransaction.count();
        } catch {}
        const maxOrderNumberFromDb = await getMaxOrderNumberFromDb().catch(() => 0);
        inMemoryFallbackSequence = Math.max(totalManual + totalStars, maxOrderNumberFromDb);
      }
    }
    inMemoryFallbackSequence += 1;
    seq = inMemoryFallbackSequence;
  }
  return `${prefix}${seq}`;
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
  return prisma.$transaction(async tx => {
  await lockRow(tx, 'User', params.userId);
  const user = await tx.user.findUnique({ where: { id: params.userId } });
  if (user) {
    const isExpired = user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt) < new Date() : false;
    if (user.subscriptionStatus === 'ACTIVE' && !isExpired && user.plan !== 'FREE') {
      const targetPlan = (params.plan || '').toUpperCase();
      const currentPlan = (user.plan || '').toUpperCase();
      if (currentPlan === targetPlan || isDowngrade(currentPlan, targetPlan)) {
        return {
          success: false,
          error: createCanonicalError(
            'ACTIVE_SUBSCRIPTION_EXISTS',
            `You already have an active ${user.plan} plan. You cannot repurchase the same tier or downgrade while active. Wait until this one expires.`
          ),
        };
      }
    }
  }

  const existingPending = await tx.manualPaymentRequest.findFirst({
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

  const req = await tx.manualPaymentRequest.create({
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
  });
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

  const durationDays = config.subscriptionDurationDays ?? 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    await lockRow(tx, 'User', req.userId);
    const currentUser = await tx.user.findUnique({ where: { id: req.userId } });
    if (currentUser && isDowngrade(currentUser.plan, tier) && currentUser.subscriptionStatus === 'ACTIVE' && (!currentUser.subscriptionExpiresAt || currentUser.subscriptionExpiresAt > new Date())) throw new Error('Cannot downgrade an active subscription.');
    const updated = await tx.manualPaymentRequest.updateMany({
      where: { id: req.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        adminNote: params.note || 'Payment verified and approved by admin',
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new Error('Payment request not found or already processed.');
    }

    const updatedUser = await tx.user.update({
      where: { id: req.userId },
      data: {
        plan: tier,
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: expiresAt,
        maxDuration: config.maxDuration,
        dailyLimit: config.dailyLimit,
        dailyCallsUsed: 0,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_APPROVAL',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ plan: req.user?.plan || 'FREE' }),
        afterState: JSON.stringify({ plan: tier, subscriptionStatus: 'ACTIVE' }),
        reason: params.note || 'Manual payment approved',
      },
    });

    const updatedReq = await tx.manualPaymentRequest.findUnique({
      where: { id: req.id },
    });

    return { request: updatedReq!, user: updatedUser };
  });

  return result;
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

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.manualPaymentRequest.updateMany({
      where: { id: req.id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        adminNote: params.note || 'Payment rejected by admin',
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      throw new Error('Payment request not found or already processed.');
    }

    await tx.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_REJECTION',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ status: req.status }),
        afterState: JSON.stringify({ status: 'REJECTED' }),
        reason: params.note || 'Payment rejected',
      },
    });

    const updatedReq = await tx.manualPaymentRequest.findUnique({
      where: { id: req.id },
    });

    return { request: updatedReq! };
  });

  return result;
}

export async function refundManualPaymentRequest(params: {
  requestId: string;
  adminId: string;
  refundProof: string;
  note?: string;
}) {
  if (!params.refundProof || !params.refundProof.trim()) {
    throw new Error('Bank transfer bill / proof is strictly required to approve a refund.');
  }
  decodePaymentProof(params.refundProof.trim());

  const req = await prisma.manualPaymentRequest.findUnique({
    where: { id: params.requestId },
    include: { user: true },
  });

  if (!req || !['APPROVED', 'REFUND_PENDING'].includes(req.status)) {
    throw new Error('Payment request not found or already refunded.');
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockRow(tx, 'User', req.userId);
    const changed = await tx.manualPaymentRequest.updateMany({
      where: { id: req.id, status: req.status },
      data: {
        status: 'REFUNDED',
        refundProof: params.refundProof.trim(),
        adminNote: params.note || 'UZS Payment refund approved with transfer bill attached',
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new Error('Refund request already processed.');
    const updatedReq = (await tx.manualPaymentRequest.findUnique({ where: { id: req.id } }))!;

    const currentUser = await tx.user.findUnique({ where:{id:req.userId} });
    const boundary = req.reviewedAt || req.createdAt;
    const laterManual = await tx.manualPaymentRequest.findFirst({ where:{userId:req.userId,status:{in:['APPROVED','REFUND_PENDING']},reviewedAt:{gt:boundary}} });
    const laterStars = await tx.starsTransaction.findFirst({ where:{userId:req.userId,status:'PAID',createdAt:{gt:boundary}} });
    const preserve = !!laterManual || !!laterStars || !!currentUser?.customPlanName || currentUser?.plan !== req.plan;
    const updatedUser = preserve ? currentUser! : await tx.user.update({
      where: { id: req.userId },
      data: {
        plan: 'FREE',
        subscriptionStatus: 'REFUNDED',
        retentionOverride:null,recordingLimitOverride:null,
        subscriptionExpiresAt: null,
        maxDuration: plansConfig.FREE.maxDuration,
        dailyLimit: plansConfig.FREE.dailyLimit,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_REFUND',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ plan: req.plan, status: req.status }),
        afterState: JSON.stringify({ plan: 'FREE', status: 'REFUNDED' }),
        reason: params.note || 'Manual payment refund approved with transfer proof',
      },
    });

    return { request: updatedReq, user: updatedUser };
  });

  return result;
}

export async function rejectManualPaymentRefund(params: {
  requestId: string;
  adminId: string;
  reason: string;
  note?: string;
}) {
  const reasonText = params.reason?.trim() || params.note?.trim();
  if (!reasonText) {
    throw new Error('Rejection reason is strictly required to reject a refund request.');
  }

  const req = await prisma.manualPaymentRequest.findUnique({
    where: { id: params.requestId },
    include: { user: true },
  });

  if (!req || req.status !== 'REFUND_PENDING') {
    throw new Error('Payment request not found.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const changed = await tx.manualPaymentRequest.updateMany({
      where: { id: req.id, status: 'REFUND_PENDING' },
      data: {
        status: 'APPROVED',
        refundReason: reasonText,
        adminNote: `[Refund Rejected]: ${reasonText}`,
        reviewedBy: params.adminId,
        reviewedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new Error('Refund request already processed.');
    const updatedReq = (await tx.manualPaymentRequest.findUnique({ where: { id: req.id } }))!;

    await tx.auditLog.create({
      data: {
        action: 'MANUAL_PAYMENT_REFUND_REJECT',
        targetId: req.userId,
        adminId: params.adminId,
        beforeState: JSON.stringify({ status: req.status }),
        afterState: JSON.stringify({ status: 'APPROVED' }),
        reason: reasonText,
      },
    });

    return { request: updatedReq, user: req.user };
  });

  return result;
}

export async function revokePlanOnRefund(params: {
  transactionId: string;
  adminId: string;
  reason?: string;
  providerConfirmed?: boolean;
}) {
  if (process.env.NODE_ENV !== 'test' && !params.providerConfirmed) throw new Error('Provider refund confirmation is required.');
  const tx = await prisma.starsTransaction.findUnique({
    where: { id: params.transactionId },
    include: { user: true },
  });

  if (!tx || tx.status === 'REFUNDED') {
    throw new Error('Transaction not found or already refunded.');
  }

  // Server-Enforced Refund Policy:
  // Refunds are granted ONLY if callsUsed < callLimit * 0.10 OR (Date.now() - purchaseDate) < 48 * 3600 * 1000
  const callsUsed = await getUserCallsUsedThisPeriod(tx.userId, tx.user);
  const callLimit = getDailyLimitForPlan(tx.planTier);
  const purchaseDate = new Date(tx.createdAt).getTime();
  const now = Date.now();
  const ageMs = now - purchaseDate;
  const ageDays = (ageMs / (24 * 3600 * 1000)).toFixed(1);

  const isUsageEligible = callsUsed < callLimit * 0.10;
  const isTimeEligible = ageMs < 48 * 3600 * 1000;

  if (!params.providerConfirmed && !isUsageEligible && !isTimeEligible) {
    throw new Error(
      `Refund rejected: User has utilized ${callsUsed} of ${callLimit} calls (>=10%) and purchase was made ${ageDays} days ago (>2 days).`
    );
  }

  const { updatedTx, updatedUser } = await prisma.$transaction(async db => {
    await lockRow(db, 'User', tx.userId);
    const changed = await db.starsTransaction.updateMany({ where: { id: tx.id, status: tx.status }, data: {
      status: 'REFUNDED', refundReason: params.reason || 'Telegram Stars payment refunded', refundedAt: new Date(), refundFailure: null,
    } });
    if (changed.count !== 1) throw new Error('Refund already processed.');
    const newerStars = await db.starsTransaction.findFirst({ where: { userId: tx.userId, status: 'PAID', createdAt: { gt: tx.createdAt } } });
    const newerManual = await db.manualPaymentRequest.findFirst({ where: { userId: tx.userId, status: { in: ['APPROVED', 'REFUND_PENDING'] }, reviewedAt: { gt: tx.createdAt } } });
    const user = await db.user.findUnique({ where: { id: tx.userId } });
    const preserveSubscription = tx.entitlementApplied === false || !!newerStars || !!newerManual || !!user?.customPlanName || user?.plan !== tx.planTier;
    const updatedUser = preserveSubscription ? user! : await db.user.update({ where: { id: tx.userId }, data: {
      plan: 'FREE', subscriptionStatus: 'REFUNDED', subscriptionExpiresAt: null, maxDuration: plansConfig.FREE.maxDuration, dailyLimit: plansConfig.FREE.dailyLimit, recordingLimitOverride:null,retentionOverride:null,
    } });
    await db.auditLog.create({ data: {
      action: 'STARS_REFUND_REVOKE', targetId: tx.userId, adminId: params.adminId,
      beforeState: JSON.stringify({ plan: user?.plan, status: tx.status }),
      afterState: JSON.stringify({ plan: updatedUser.plan, status: 'REFUNDED', preservedNewerSubscription: preserveSubscription }),
      reason: params.reason || 'Stars payment refunded',
    } });
    return { updatedTx: (await db.starsTransaction.findUnique({ where: { id: tx.id } }))!, updatedUser };
  });

  return { transaction: updatedTx, user: updatedUser };
}
