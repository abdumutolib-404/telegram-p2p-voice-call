import { Bot } from 'grammy';
import { MyContext } from './types';

type SendMessageOptions = Parameters<Bot<MyContext>['api']['sendMessage']>[2];

interface QueueItem {
  telegramId: string;
  text: string;
  options?: SendMessageOptions;
  retries?: number;
}

export class NotificationQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;

  async enqueue(bot: Bot<MyContext>, telegramId: string, text: string, options?: SendMessageOptions) {
    this.queue.push({ telegramId, text, options, retries: 0 });
    this.process(bot);
  }

  private async process(bot: Bot<MyContext>) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        await bot.api.sendMessage(item.telegramId, item.text, item.options);
      } catch (err: unknown) {
        const errorObj = err as { error_code?: number; parameters?: { retry_after?: number }; message?: string };
        if (errorObj?.error_code === 429) {
          // Rate limited by Telegram API
          const retryAfter = (errorObj.parameters?.retry_after || 3) * 1000;
          const currentRetries = item.retries || 0;

          if (currentRetries < 5) {
            console.warn(`[Bot Notification] 429 Rate limited. Retrying (${currentRetries + 1}/5) after ${retryAfter}ms`);
            this.queue.unshift({ ...item, retries: currentRetries + 1 });
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
          } else {
            console.error(`[Bot Notification] Max retries reached for message to ${item.telegramId}. Message dropped.`);
          }
        } else {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[Bot Notification] Failed to send message to ${item.telegramId}:`, errMsg);
        }
      }

      // Small delay between outgoing messages to respect rate limits (30 msgs/sec max)
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.isProcessing = false;
  }
}

export const notificationQueue = new NotificationQueue();
