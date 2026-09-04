import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '../config/database';
import { getRedis, isRedisReady } from '../config/redis';
import { env } from '../config/env';
import { notificationQueue } from '../bot/notifications';
import { logger } from '../utils/logger';
import { DistributedLeaderLock } from './leaderLock';
import type { MyContext } from '../bot/types';

export const SURGE_CONFIG = {
  GLOBAL_COOLDOWN_SECONDS: 4 * 3600, // 4 hours between global broadcasts
  USER_COOLDOWN_SECONDS: 48 * 3600, // 48 hours per student
  MIN_ABSOLUTE_QUORUM: 12, // Minimum concurrent callers/searchers to qualify as surge
  DAU_PERCENTAGE_THRESHOLD: 0.1, // 10% of 7-day active users
  MAX_RECIPIENTS_PER_CYCLE: 75, // Cap recipients per surge to avoid queue stampede
};

export class SurgeAlertService {
  private readonly globalCooldownKey = 'pairtalk:surge_alert:global_last_sent';
  private readonly userCooldownPrefix = 'pairtalk:surge_alert:user:';
  private leaderLock: DistributedLeaderLock | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;

  public async getActiveConcurrentCount(): Promise<{ callersCount: number; queuedCount: number; totalCount: number }> {
    try {
      const activeCalls = await prisma.callSession.count({
        where: { status: 'ACTIVE' },
      });
      const callersCount = activeCalls * 2;

      let queuedCount = 0;
      if (isRedisReady()) {
        const redis = getRedis();
        const keys = await redis.keys('match_queue:*');
        const bucketKeys = keys.filter(
          (k) => !k.includes('priority') && !k.includes('global') && !k.includes('band:')
        );
        for (const bk of bucketKeys) {
          const count = await redis.scard(bk);
          queuedCount += count;
        }
      }

      return {
        callersCount,
        queuedCount,
        totalCount: callersCount + queuedCount,
      };
    } catch (err) {
      logger.warn('Failed to calculate concurrent active count', {
        service: 'surgeAlert',
      }, err);
      return { callersCount: 0, queuedCount: 0, totalCount: 0 };
    }
  }

  public async checkAndTriggerSurgeAlert(
    botInstance?: Bot<MyContext> | null,
    now = new Date()
  ): Promise<{ triggered: boolean; reason?: string; recipientsCount?: number }> {
    if (!botInstance) {
      return { triggered: false, reason: 'Bot instance unavailable' };
    }

    if (!isRedisReady()) {
      return { triggered: false, reason: 'Redis not ready' };
    }

    const redis = getRedis();

    // 2. Global Cooldown Check
    try {
      const lastSent = await redis.get(this.globalCooldownKey);
      if (lastSent) {
        return { triggered: false, reason: 'Global surge cooldown active' };
      }
    } catch {
      // ignore
    }

    // 3. Check Active Concurrent Activity & Surge Threshold
    const { callersCount, queuedCount, totalCount } = await this.getActiveConcurrentCount();

    // Calculate 7-day active user count (DAU proxy)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
    const dauCount = await prisma.user.count({
      where: {
        updatedAt: { gte: sevenDaysAgo },
        isBanned: false,
        isPermanentlyBanned: false,
      },
    });

    const dynamicThreshold = Math.max(
      SURGE_CONFIG.MIN_ABSOLUTE_QUORUM,
      Math.floor(dauCount * SURGE_CONFIG.DAU_PERCENTAGE_THRESHOLD)
    );

    if (totalCount < dynamicThreshold) {
      return {
        triggered: false,
        reason: `Activity (${totalCount}) below surge threshold (${dynamicThreshold})`,
      };
    }

    // 4. Candidate Retrieval & Anti-Spam Filtering
    const candidateUsers = await prisma.user.findMany({
      where: {
        isBanned: false,
        isPermanentlyBanned: false,
        dnd: false,
      },
      select: {
        id: true,
        telegramId: true,
        dailyLimit: true,
        dailyCallsUsed: true,
        band: true,
        alias: true,
      },
      take: 250,
    });

    // Find currently active sessions to exclude users in calls
    const activeSessions = await prisma.callSession.findMany({
      where: { status: 'ACTIVE' },
      select: { userAId: true, userBId: true },
    });
    const activeUserIds = new Set<string>();
    for (const s of activeSessions) {
      activeUserIds.add(s.userAId);
      activeUserIds.add(s.userBId);
    }

    const eligibleRecipients: { id: string; telegramId: string; band: number }[] = [];

    for (const candidate of candidateUsers) {
      // Must have daily calls remaining
      if (candidate.dailyCallsUsed >= candidate.dailyLimit) continue;
      // Exclude if currently in call
      if (activeUserIds.has(candidate.id)) continue;

      // Exclude if currently in matchmaking queue
      const inQueue = await redis.get(`user_queue:${candidate.id}`);
      if (inQueue) continue;

      // Check per-user 48h cooldown
      const userCooldown = await redis.get(`${this.userCooldownPrefix}${candidate.id}`);
      if (userCooldown) continue;

      eligibleRecipients.push({
        id: candidate.id,
        telegramId: candidate.telegramId.toString(),
        band: candidate.band,
      });

      if (eligibleRecipients.length >= SURGE_CONFIG.MAX_RECIPIENTS_PER_CYCLE) {
        break;
      }
    }

    if (eligibleRecipients.length === 0) {
      return { triggered: false, reason: 'No eligible candidates passing cooldown & quota filters' };
    }

    // 5. Compose Notification Card & Rate-Paced Dispatch
    const miniAppUrl = env.MINI_APP_URL || 'https://t.me/PairTalkBot/call';
    const inlineKb = new InlineKeyboard()
      .webApp('🎙️ Match Now (Web App)', miniAppUrl)
      .row()
      .text('🔕 Mute Peak Alerts', 'mute_surge_alerts');

    const messageText =
      `🔥 <b>Peak Practice Surge: ${totalCount} IELTS Learners Online!</b>\n\n` +
      `⚡ <b>Instant Matches</b>: Average queue time is currently under 10 seconds.\n` +
      `👥 <b>Active Levels</b>: Band 6.0 – 7.5 learners are practicing right now.\n\n` +
      `<i>Jump in for a quick 15-minute speaking session before the queue cools down!</i>`;

    for (const recipient of eligibleRecipients) {
      await notificationQueue.enqueue(botInstance, recipient.telegramId, messageText, {
        parse_mode: 'HTML',
        reply_markup: inlineKb,
      });

      // Record per-user cooldown (48 hours)
      await redis.set(
        `${this.userCooldownPrefix}${recipient.id}`,
        now.toISOString(),
        'EX',
        SURGE_CONFIG.USER_COOLDOWN_SECONDS
      ).catch(() => undefined);
    }

    // Record global cooldown (6 hours)
    await redis.set(
      this.globalCooldownKey,
      now.toISOString(),
      'EX',
      SURGE_CONFIG.GLOBAL_COOLDOWN_SECONDS
    ).catch(() => undefined);

    logger.info('Peak-hour surge alert broadcast completed', {
      service: 'surgeAlert',
      event: 'surge_broadcast_completed',
      totalActive: totalCount,
      threshold: dynamicThreshold,
      recipientsCount: eligibleRecipients.length,
    });

    return {
      triggered: true,
      recipientsCount: eligibleRecipients.length,
    };
  }

  public startScheduler(getBot: () => Bot<MyContext> | null, intervalMs = 10 * 60 * 1000): void {
    if (this.intervalTimer) return;

    this.leaderLock = new DistributedLeaderLock({
      lockKey: 'pairtalk:surge:scheduler:lock',
      ttlMs: 25000,
      heartbeatIntervalMs: 8000,
    });

    logger.info('Initializing Peak-Hour Surge Alert Scheduler', {
      service: 'surgeAlert',
      intervalMinutes: Math.round(intervalMs / 60000),
    });

    const runCheck = async () => {
      try {
        if (!this.leaderLock) return;
        const isLeader = await this.leaderLock.acquire();
        if (!isLeader) return;

        const bot = getBot();
        if (!bot) return;

        await this.checkAndTriggerSurgeAlert(bot);
      } catch (err) {
        logger.error('Error during scheduled surge alert cycle', {
          service: 'surgeAlert',
        }, err);
      }
    };

    // Initial check after 2 minutes of uptime
    setTimeout(() => {
      void runCheck();
    }, 120_000);

    this.intervalTimer = setInterval(() => {
      void runCheck();
    }, intervalMs);
  }

  public stopScheduler(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const surgeAlertService = new SurgeAlertService();
