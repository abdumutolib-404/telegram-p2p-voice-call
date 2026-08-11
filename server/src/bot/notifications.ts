import { Bot } from 'grammy';
import { MyContext } from './types';

export class NotificationQueue {
  private queue: Array<{ telegramId: number; text: string; options?: any }> = [];
  private isProcessing = false;

  async enqueue(bot: Bot<MyContext>, telegramId: number, text: string, options?: any) {
    this.queue.push({ telegramId, text, options });
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
      } catch (err: any) {
        if (err?.error_code === 429) {
          // Rate limited by Telegram API
          const retryAfter = (err.parameters?.retry_after || 3) * 1000;
          console.warn(`[Bot Notification] 429 Rate limited. Retrying after ${retryAfter}ms`);
          this.queue.unshift(item);
          await new Promise((resolve) => setTimeout(resolve, retryAfter));
        } else {
          console.warn(`[Bot Notification] Failed to send message to ${item.telegramId}:`, err.message);
        }
      }

      // Small delay between outgoing messages to respect rate limits (30 msgs/sec max)
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.isProcessing = false;
  }
}

export const notificationQueue = new NotificationQueue();
