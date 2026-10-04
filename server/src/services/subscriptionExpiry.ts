import { Bot, InlineKeyboard } from 'grammy';
import cron from 'node-cron';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { MyContext } from '../bot/types';
import { notificationQueue, persistNotification } from '../bot/notifications';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod, getPlansConfig } from './plan';
import { lockRow } from '../utils/transactionLock';
import { logger } from '../utils/logger';
import { escapeHtml } from '../utils/sanitize';

export interface ExpiryCheckResult {
  expiredCount: number;
  /** Newly persisted advance notices; delivery is handled by the notification worker. */
  warnedCount: number;
}

/**
 * Applies expired subscriptions and durably queues notices within the final 24 hours.
 */
export async function checkAndProcessSubscriptionExpirations(
  bot: Bot<MyContext> | null
): Promise<ExpiryCheckResult> {
  const now = new Date();
  let expiredCount = 0;
  let warnedCount = 0;

  // 1. Process Expired Subscriptions (Plan -> FREE)
  try {
    const expiredUsers = await prisma.user.findMany({
      where: {
        plan: { not: 'FREE' },
        subscriptionExpiresAt: {
          lte: now,
          not: null,
        },
      },
    });

    for (const user of expiredUsers) {
      const changed = await prisma.$transaction(async tx => {
        await lockRow(tx, 'User', user.id);
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current?.subscriptionExpiresAt || current.subscriptionExpiresAt > now || current.plan === 'FREE') return false;
        await tx.user.update({
          where: { id: current.id },
          data: {
            plan: 'FREE', subscriptionStatus: 'EXPIRED', customPlanName: null,
            dailyLimit: getPlansConfig().FREE.dailyLimit, maxDuration: getPlansConfig().FREE.maxDuration,
            recordingLimitOverride: null, retentionOverride: null, subscriptionExpiresAt: null,
          },
        });
        await tx.auditLog.create({ data: {
          action: 'SUBSCRIPTION_EXPIRED', targetId: current.id, adminId: 'SYSTEM',
          beforeState: JSON.stringify({ plan: current.plan, subscriptionExpiresAt: current.subscriptionExpiresAt }),
          afterState: JSON.stringify({ plan: 'FREE' }),
        } });
        await persistNotification(tx, current.telegramId.toString(),
          `⌛ <b>Subscription Expired</b>\n\n` +
          `Your <b>${escapeHtml(current.customPlanName || current.plan)} Plan</b> subscription has reached its expiration date.\n\n` +
          `Your account has now reverted to the <b>Free Plan</b>. View plans for your current allowances.\n\n` +
          `To continue practicing with longer calls, more monthly sessions, and extended recording archives, upgrade anytime!`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⭐ View Plans', 'show_plans') }, false,
          `subscription:expired:${current.id}:${current.subscriptionExpiresAt.toISOString()}`);
        return true;
      });
      if (!changed) continue;
      expiredCount++;

    }
  } catch (err) {
    logger.error('Error checking expired subscriptions', {
      service: 'subscriptionExpiry',
      event: 'expired_subs_check_failed',
    }, err);
  }

  // 2. Process 24-Hour Expiry Warnings (Advance Notification)
  try {
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const expiringSoonUsers = await prisma.user.findMany({
      where: {
        plan: { not: 'FREE' },
        subscriptionExpiresAt: {
          gt: now,
          lte: next24h,
        },
      },
    });

    for (const user of expiringSoonUsers) {
      const queued = await prisma.$transaction(async tx => {
        await lockRow(tx, 'User', user.id);
        const current = await tx.user.findUnique({ where: { id: user.id } });
        if (!current || current.plan === 'FREE' || !current.subscriptionExpiresAt || current.subscriptionExpiresAt <= now || current.subscriptionExpiresAt > next24h) return false;
        const dateStr = current.subscriptionExpiresAt.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
        return persistNotification(tx, current.telegramId.toString(),
          `⏳ <b>Subscription Expiring Soon</b>\n\n` +
          `Your <b>${escapeHtml(current.customPlanName || current.plan)} Plan</b> subscription will expire on <b>${dateStr}</b>.\n\n` +
          `Renew your plan now to ensure your monthly call allowances and recording storage remain active without interruption!`,
          { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⭐ Renew Plan', 'show_plans') }, false,
          `subscription:warning:${current.id}:${current.subscriptionExpiresAt.toISOString()}`);
      });
      if (queued) warnedCount++;
    }
  } catch (err) {
    logger.error('Error checking expiring subscriptions', {
      service: 'subscriptionExpiry',
      event: 'expiring_subs_check_failed',
    }, err);
  }

  if (bot) void notificationQueue.recover(bot).catch(error => logger.warn('Subscription notification recovery unavailable', { service: 'subscriptionExpiry' }, error));
  return { expiredCount, warnedCount };
}

/**
 * Notifies the user if they have reached their monthly call limit.
 */
export async function notifyQuotaLimitReachedIfExhausted(
  bot: Bot<MyContext> | null,
  userId: string,
  user?: any
): Promise<boolean> {
  if (!bot) return false;

  try {
    const dbUser = user || (await prisma.user.findUnique({ where: { id: userId } }));
    if (!dbUser || !dbUser.telegramId) return false;

    const entitlement = getEffectiveEntitlement(dbUser);
    if (entitlement.isUnlimited) return false;

    const callsUsed = await getUserCallsUsedThisPeriod(dbUser.id, dbUser);
    if (callsUsed >= entitlement.callLimit) {
      const redis = getRedis();
      const quotaDedupKey = `quota_limit_warn:${dbUser.id}:${dbUser.plan}:${callsUsed}`;
      const acquired = await redis.set(quotaDedupKey, '1', 'PX', 24 * 3600 * 1000, 'NX');

      if (acquired === 'OK') {
        const inlineKb = new InlineKeyboard().text('⭐ Upgrade Plan', 'show_plans');
        await notificationQueue.enqueue(
          bot,
          dbUser.telegramId.toString(),
          `⚠️ <b>Monthly Call Limit Reached</b>\n\n` +
            `You have used all <b>${callsUsed} / ${entitlement.callLimit} calls</b> allocated for your <b>${entitlement.plan} Plan</b> this month.\n\n` +
            `Your monthly limit will reset at the start of your next billing cycle.\n` +
            `Want to practice more? Upgrade your plan anytime to unlock more call sessions!`,
          { parse_mode: 'HTML', reply_markup: inlineKb }
        );
        return true;
      }
    }
  } catch (err) {
    logger.error('Error sending quota notification', {
      service: 'subscriptionExpiry',
      event: 'quota_notify_failed',
      userId,
    }, err);
  }

  return false;
}

/**
 * Starts the recurring cron job for subscription expiry and advance reminders.
 */
export function startSubscriptionExpiryCron(botSupplier: () => Bot<MyContext> | null) {
  // Run every 10 minutes
  const task = cron.schedule('*/10 * * * *', async () => {
    try {
      const bot = botSupplier();
      const res = await checkAndProcessSubscriptionExpirations(bot);
      if (res.expiredCount > 0 || res.warnedCount > 0) {
        logger.info(`Processed ${res.expiredCount} expirations, queued ${res.warnedCount} advance reminders.`, {
          service: 'subscriptionExpiry',
          event: 'subscription_expiry_cron_run',
          expiredCount: res.expiredCount,
          warnedCount: res.warnedCount,
        });
      }
    } catch (err) {
      logger.error('Subscription expiry cron job error', {
        service: 'subscriptionExpiry',
        event: 'subscription_expiry_cron_error',
      }, err);
    }
  });
  logger.info('Subscription expiry and limit reminder cron scheduled (every 10 min).', {
    service: 'subscriptionExpiry',
    event: 'subscription_expiry_cron_scheduled',
  });
  return () => task.stop();
}
