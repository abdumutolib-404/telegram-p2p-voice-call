import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '../config/database';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { notificationQueue } from '../bot/notifications';
import { logger } from '../utils/logger';
import type { MyContext } from '../bot/types';

export class TopicNotificationService {
  private readonly lastBroadcastKey = 'pairtalk:topic_broadcast:last_sent';
  private readonly cooldownSeconds = 48 * 3600; // 48-hour cooldown

  public async broadcastNewTopics(
    newQuestionsCount: number,
    topicNames: string[],
    botInstance?: Bot<MyContext> | null
  ): Promise<{ sent: boolean; reason?: string }> {
    if (!botInstance) {
      return { sent: false, reason: 'Bot instance not available' };
    }

    if (newQuestionsCount < 3 && topicNames.length === 0) {
      return { sent: false, reason: 'Below threshold for notification' };
    }

    const redis = getRedis();

    // Check anti-spam cooldown
    try {
      const lastSent = await redis.get(this.lastBroadcastKey);
      if (lastSent) {
        logger.info('Skipping topic broadcast: inside 48-hour cooldown period', {
          service: 'topicNotification',
          lastSent,
        });
        return { sent: false, reason: 'Cooldown active' };
      }
    } catch {
      // ignore
    }

    try {
      // Find active learners who haven't enabled DND
      const users = await prisma.user.findMany({
        where: {
          isBanned: false,
          isPermanentlyBanned: false,
          dnd: false,
        },
        select: { telegramId: true },
        take: 500, // Batch limit per cycle
      });

      if (users.length === 0) {
        return { sent: false, reason: 'No eligible recipients found' };
      }

      const miniAppUrl = env.MINI_APP_URL || 'https://t.me/PairTalkBot/call';
      const inlineKb = new InlineKeyboard().url('🎯 Practice New Topics Now', miniAppUrl);

      const topicListStr = topicNames.length > 0 ? topicNames.slice(0, 3).join(', ') : 'Exam Recall Questions';

      const messageText =
        `📢 <b>New IELTS Speaking Topics Added!</b>\n\n` +
        `We have updated the live IELTS question simulator with <b>${newQuestionsCount}</b> fresh exam recall prompts across <i>${topicListStr}</i>.\n\n` +
        `Use the in-call <b>Questions</b> drawer to practice Part 1, 2, and 3 prompts with real Cambridge preparation timers!`;

      for (const u of users) {
        await notificationQueue.enqueue(
          botInstance,
          u.telegramId.toString(),
          messageText,
          { parse_mode: 'HTML', reply_markup: inlineKb }
        );
      }

      // Record broadcast timestamp in Redis with 48h TTL
      try {
        await redis.set(this.lastBroadcastKey, new Date().toISOString(), 'EX', this.cooldownSeconds);
      } catch {
        // ignore
      }

      logger.info('Successfully enqueued new topic broadcast to active candidates', {
        service: 'topicNotification',
        recipientsCount: users.length,
        newQuestionsCount,
      });

      return { sent: true };
    } catch (err: unknown) {
      logger.error('Failed sending topic broadcast notifications', {
        service: 'topicNotification',
      }, err);
      return { sent: false, reason: 'Broadcast failure' };
    }
  }
}

export const topicNotificationService = new TopicNotificationService();
