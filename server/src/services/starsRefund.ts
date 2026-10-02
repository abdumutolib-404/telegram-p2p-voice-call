import { prisma } from '../config/database';
import { lockRow } from '../utils/transactionLock';
import { getDailyLimitForPlan, getUserCallsUsedThisPeriod, revokePlanOnRefund } from './plan';
import { logger } from '../utils/logger';
type Provider = { refundStarPayment: (userId: number, chargeId: string) => Promise<unknown> };

export async function processStarsRefund(params: { transactionId: string; adminId: string; reason?: string; ownerTelegramId?: number }, provider: Provider) {
  const transaction = await prisma.$transaction(async tx => {
    await lockRow(tx, 'StarsTransaction', params.transactionId);
    const purchase = await tx.starsTransaction.findUnique({ where: { id: params.transactionId }, include: { user: true } });
    if (!purchase || (params.ownerTelegramId !== undefined && purchase.user.telegramId !== BigInt(params.ownerTelegramId))) throw new Error('Refund transaction not found.');
    if (purchase.status === 'REFUNDED') return purchase;
    if (purchase.status === 'REFUND_PROCESSING') throw new Error('This refund is already processing. Check its status before retrying.');
    if (purchase.status !== 'PAID' && purchase.status !== 'REFUND_PENDING') throw new Error('This transaction cannot be refunded.');
    const callsUsed = await getUserCallsUsedThisPeriod(purchase.userId, purchase.user);
    if (callsUsed >= getDailyLimitForPlan(purchase.planTier) * .10 && Date.now() - purchase.createdAt.getTime() >= 48 * 3600000) throw new Error('Refund eligibility period and usage allowance exceeded.');
    const changed = await tx.starsTransaction.updateMany({ where: { id: purchase.id, status: purchase.status }, data: {
      status: 'REFUND_PROCESSING', refundRequestedAt: new Date(), refundAdminId: params.adminId,
      refundReason: params.reason || 'Stars refund requested', refundFailure: null,
    } });
    if (changed.count !== 1) throw new Error('This refund is already processing.');
    await tx.auditLog.create({ data: { action: 'STARS_REFUND_REQUESTED', targetId: purchase.id, adminId: params.adminId, beforeState: JSON.stringify({ status: purchase.status }), afterState: JSON.stringify({ status: 'REFUND_PROCESSING' }) } });
    return { ...purchase, status: 'REFUND_PROCESSING' };
  });
  if (transaction.status === 'REFUNDED') return { transaction, user: transaction.user, alreadyProcessed: true };
  return completeStarsRefund(transaction.id, provider);
}

async function completeStarsRefund(id: string, provider: Provider) {
  const purchase = await prisma.starsTransaction.findUnique({ where: { id }, include: { user: true } });
  if (!purchase || purchase.status !== 'REFUND_PROCESSING') throw new Error('Refund is not pending provider confirmation.');
  try {
    const success = await provider.refundStarPayment(Number(purchase.user.telegramId), purchase.telegramPaymentId);
    if (success !== true) throw new Error('Telegram did not confirm the refund.');
  } catch (error: any) {
    // The charge ID identifies one provider refund. A replay after an interrupted local commit
    // can only finalize after Telegram explicitly confirms that this charge was refunded.
    if (error?.error_code === 400 && /\b(?:PAYMENT|CHARGE)_ALREADY_REFUNDED\b/i.test(error.description || '')) {
      // Confirmed provider outcome; continue local reconciliation.
    } else {
      const permanent = [400, 401, 403].includes(error?.error_code);
      await prisma.$transaction(async tx => {
        await tx.starsTransaction.updateMany({ where: { id, status: 'REFUND_PROCESSING' }, data: { status: permanent ? 'REFUND_FAILED' : 'REFUND_PROCESSING', refundFailure: permanent ? 'Provider rejected refund; administrator review required.' : 'Provider confirmation unavailable; reconciliation pending.' } });
        await tx.auditLog.create({ data: { action: permanent ? 'STARS_REFUND_FAILED' : 'STARS_REFUND_RECONCILIATION_PENDING', targetId: id, adminId: purchase.refundAdminId || 'SYSTEM', reason: permanent ? 'Provider rejected refund' : 'Provider outcome uncertain' } });
      });
      throw new Error(permanent ? 'Telegram rejected the refund. Subscription was preserved.' : 'Refund confirmation is pending. Subscription was preserved; do not issue another refund.');
    }
  }
  const result = await revokePlanOnRefund({ transactionId: id, adminId: purchase.refundAdminId || 'SYSTEM', reason: purchase.refundReason || undefined, providerConfirmed: true });
  return { ...result, alreadyProcessed: false };
}

export function startStarsRefundRecovery(provider: Provider): () => Promise<void> {
  let stopped = false, timer: NodeJS.Timeout | undefined;
  let active: Promise<void> | null = null;
  const recover = async () => {
    if (stopped) return;
    try {
      const pending = await prisma.starsTransaction.findMany({ where: { status: 'REFUND_PROCESSING', refundRequestedAt: { lt: new Date(Date.now() - 120000) } }, take: 20 });
      for (const purchase of pending) {
        if (stopped) break;
        // Fence recovery across replicas using a CAS lease in persistent storage.
        const claimed = await prisma.starsTransaction.updateMany({ where: { id: purchase.id, status: 'REFUND_PROCESSING', refundRequestedAt: purchase.refundRequestedAt }, data: { refundRequestedAt: new Date() } });
        if (claimed.count !== 1) continue;
        await completeStarsRefund(purchase.id, provider).catch(error => logger.warn('Stars refund reconciliation deferred', { service: 'payments', transactionId: purchase.id }, error));
      }
    } catch (error) { logger.warn('Stars refund recovery unavailable', { service: 'payments' }, error); }
  };
  const tick = async () => {
    if (stopped) return;
    active = recover();
    try { await active; } finally { active = null; }
    if (!stopped) timer = setTimeout(tick, 60000);
  };
  timer = setTimeout(tick, 60000);
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
