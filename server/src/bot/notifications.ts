import { Bot } from 'grammy';
import { MyContext } from './types';
import { logger } from '../utils/logger';

type SendMessageOptions = Parameters<Bot<MyContext>['api']['sendMessage']>[2];

interface QueueItem {
  telegramId: string;
  text: string;
  options?: SendMessageOptions;
  retries?: number;
  isUrgent?: boolean;
}

export class NotificationQueue {
  private urgentQueue: QueueItem[] = [];
  private bulkQueue: QueueItem[] = [];
  private isProcessing = false;

  async enqueue(
    bot: Bot<MyContext>,
    telegramId: string,
    text: string,
    options?: SendMessageOptions,
    isUrgent = false
  ) {
    const item: QueueItem = { telegramId, text, options, retries: 0, isUrgent };
    if (isUrgent) {
      this.urgentQueue.push(item);
    } else {
      this.bulkQueue.push(item);
    }
    this.process(bot);
  }

  async enqueueUrgent(
    bot: Bot<MyContext>,
    telegramId: string,
    text: string,
    options?: SendMessageOptions
  ) {
    return this.enqueue(bot, telegramId, text, options, true);
  }

  private async process(bot: Bot<MyContext>) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.urgentQueue.length > 0 || this.bulkQueue.length > 0) {
      // Prioritize urgent post-call review cards ahead of bulk marketing broadcasts
      const item = this.urgentQueue.shift() || this.bulkQueue.shift();
      if (!item) break;

      try {
        await bot.api.sendMessage(item.telegramId, item.text, item.options);
        // Rate-pacing delay to respect Telegram's 30 msg/s broadcast limit
        await new Promise((resolve) => setTimeout(resolve, 35));
      } catch (err: unknown) {
        const errorObj = err as { error_code?: number; parameters?: { retry_after?: number }; message?: string };
        if (errorObj?.error_code === 429) {
          // Rate limited by Telegram API
          const retryAfter = (errorObj.parameters?.retry_after || 3) * 1000;
          const currentRetries = item.retries || 0;

          if (currentRetries < 5) {
            logger.warn(`Telegram notification 429 rate limited. Retrying (${currentRetries + 1}/5) after ${retryAfter}ms`, {
              service: 'bot',
              event: 'notification_rate_limited',
              telegramId: item.telegramId,
              attempt: currentRetries + 1,
              retryAfter,
              isUrgent: item.isUrgent,
            });
            const targetQueue = item.isUrgent ? this.urgentQueue : this.bulkQueue;
            targetQueue.unshift({ ...item, retries: currentRetries + 1 });
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
          } else {
            logger.error(`Max retries reached for message to ${item.telegramId}. Message dropped.`, {
              service: 'bot',
              event: 'notification_max_retries_dropped',
              telegramId: item.telegramId,
            });
          }
        } else {
          logger.warn(`Failed to send message to ${item.telegramId}`, {
            service: 'bot',
            event: 'notification_send_failed',
            telegramId: item.telegramId,
          }, err);
        }
      }

      // Small delay between outgoing messages to respect rate limits (30 msgs/sec max)
      await new Promise((resolve) => setTimeout(resolve, 35));
    }

    this.isProcessing = false;
  }
}

export const notificationQueue = new NotificationQueue();
