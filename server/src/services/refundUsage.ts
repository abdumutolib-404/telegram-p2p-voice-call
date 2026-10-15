import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { discountPlan } from '../contracts/discounts';

interface Purchase {
  id: string; userId: string; createdAt: Date; reviewedAt?: Date | null;
  entitlementStartsAt?: Date | null; entitlementExpiresAt?: Date | null;
  refundCallLimit?: number | null; discountOfferId?: string | null; entitlementApplied?: boolean;
}
/** Refunds follow the purchased grant, never a mutable monthly allowance counter. */
export async function purchaseRefundUsage(purchase: Purchase, legacyCallLimit: number, db: Prisma.TransactionClient = prisma) {
  let callLimit = purchase.refundCallLimit ?? legacyCallLimit;
  if (purchase.refundCallLimit == null && purchase.discountOfferId) {
    const offer = await db.discountOffer.findUnique({where:{id:purchase.discountOfferId}});
    const campaign = offer && await db.discountCampaign.findUnique({where:{id:offer.campaignId}});
    if (campaign) callLimit = discountPlan(campaign.planSnapshot).dailyLimit;
  }
  if (!Number.isSafeInteger(callLimit) || callLimit < 1) throw new Error('Purchased refund allowance is unavailable.');
  if (purchase.entitlementApplied === false) return {callsUsed:0,callLimit};
  const startsAt = purchase.entitlementStartsAt ?? purchase.createdAt;
  // Legacy purchases lack an immutable expiry. Count history conservatively until
  // the next known grant rather than forgetting usage when the current month changes.
  let endsAt = purchase.entitlementExpiresAt ?? new Date();
  const laterStars = await db.starsTransaction.findFirst({where:{id:{not:purchase.id},userId:purchase.userId,createdAt:{gt:startsAt},entitlementApplied:true,status:{in:['PAID','REFUND_PENDING','REFUND_PROCESSING','REFUNDED']}},orderBy:{createdAt:'asc'}});
  const laterManual = await db.manualPaymentRequest.findFirst({where:{id:{not:purchase.id},userId:purchase.userId,status:{in:['APPROVED','REFUND_PENDING']},OR:[{entitlementStartsAt:{gt:startsAt}},{entitlementStartsAt:null,createdAt:{gt:startsAt}}]},orderBy:{createdAt:'asc'}});
  const laterFree = await db.discountOffer.findFirst({where:{userId:purchase.userId,status:'CLAIMED',claimedPaymentId:'FREE',claimedAt:{gt:startsAt}},orderBy:{claimedAt:'asc'}});
  for (const boundary of [laterStars?.entitlementStartsAt ?? laterStars?.createdAt, laterManual?.entitlementStartsAt ?? laterManual?.createdAt, laterFree?.claimedAt]) {
    if (boundary && boundary < endsAt) endsAt = boundary;
  }
  const callsUsed = await db.callSession.count({where:{OR:[{userAId:purchase.userId},{userBId:purchase.userId}],status:'COMPLETED',duration:{gte:5},createdAt:{gte:startsAt,lt:endsAt}}});
  return {callsUsed,callLimit};
}

export async function assertPurchaseRefundEligible(purchase: Purchase, legacyCallLimit: number, db: Prisma.TransactionClient = prisma, requestedAt = new Date()) {
  const usage = await purchaseRefundUsage(purchase, legacyCallLimit, db);
  if (usage.callsUsed >= usage.callLimit * .10 && requestedAt.getTime() - purchase.createdAt.getTime() >= 48 * 3600000) {
    throw new Error('Refund eligibility period and usage allowance exceeded.');
  }
  return usage;
}
