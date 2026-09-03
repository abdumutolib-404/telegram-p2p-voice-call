import { Bot, InlineKeyboard } from 'grammy';
import cron from 'node-cron';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { MyContext } from '../bot/types';
import { notificationQueue } from '../bot/notifications';
import { getEffectiveEntitlement, getUserCallsUsedThisPeriod } from './plan';
import { logger } from '../utils/logger';

export interface ExpiryCheckResult {
  expiredCount: number;
  warnedCount: number;
}

/**
 * Checks for expired subscriptions and sends 24-hour advance expiration reminders.
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
      const prevPlan = user.customPlanName || user.plan;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: 'FREE',
          dailyLimit: 3,
          subscriptionExpiresAt: null,
        },
      });
      expiredCount++;

      if (bot && user.telegramId) {
        const inlineKb = new InlineKeyboard().text('⭐ View Plans', 'show_plans');
        await notificationQueue.enqueue(
          bot,
          user.telegramId.toString(),
          `⌛ <b>Subscription Expired</b>\n\n` +
            `Your <b>${prevPlan} Plan</b> subscription has reached the end of its 30-day billing cycle.\n\n` +
            `Your account has now reverted to the <b>Free Plan</b> (3 calls/month, 15 min duration, 1 recording).\n\n` +
            `To continue practicing with longer calls, more monthly sessions, and extended recording archives, upgrade anytime!`,
          { parse_mode: 'HTML', reply_markup: inlineKb }
        );
      }
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

    const redis = getRedis();
    for (const user of expiringSoonUsers) {
      if (!user.subscriptionExpiresAt) continue;

      const expiryIso = user.subscriptionExpiresAt.toISOString();
      const dedupKey = `sub_exp_warn:${user.id}:${expiryIso}`;
      const acquired = await redis.set(dedupKey, '1', 'PX', 48 * 3600 * 1000, 'NX');

      if (acquired === 'OK') {
        warnedCount++;
        if (bot && user.telegramId) {
          const dateStr = user.subscriptionExpiresAt.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
          const planDisplayName = user.customPlanName || user.plan;
          const inlineKb = new InlineKeyboard().text('⭐ Renew Plan', 'show_plans');
          await notificationQueue.enqueue(
            bot,
            user.telegramId.toString(),
            `⏳ <b>Subscription Expiring in 24 Hours!</b>\n\n` +
              `Your <b>${planDisplayName} Plan</b> subscription will expire on <b>${dateStr}</b>.\n\n` +
              `Renew your plan now to ensure your monthly call allowances and recording storage remain active without interruption!`,
            { parse_mode: 'HTML', reply_markup: inlineKb }
          );
        }
      }
    }
  } catch (err) {
    logger.error('Error checking expiring subscriptions', {
      service: 'subscriptionExpiry',
      event: 'expiring_subs_check_failed',
    }, err);
  }

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
  cron.schedule('*/10 * * * *', async () => {
    try {
      const bot = botSupplier();
      const res = await checkAndProcessSubscriptionExpirations(bot);
      if (res.expiredCount > 0 || res.warnedCount > 0) {
        logger.info(`Processed ${res.expiredCount} expirations, sent ${res.warnedCount} 24h reminders.`, {
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
}
